# OID4VCI Flutter Wallet — Implementasi Holder Flow

Panduan implementasi sisi **Holder/Client** di Flutter untuk menerima Verifiable Credential
dari issuer yang menggunakan Credo-TS + OID4VCI (Pre-Authorized Code Flow).

> **Catatan:** Flutter wallet **tidak pakai Credo-TS**. Credo-TS hanya untuk backend (issuer).
> Flutter mengimplementasikan OID4VCI holder flow via HTTP calls biasa.

---

## Alur Kerja

```
Flutter QR Scanner
        │
        ▼
openid-credential-offer://?credential_offer_uri=http://202.155.132.71:3001/oid4vci/.../offers/...
        │
        ▼
[1] GET credential_offer_uri  → dapat JSON offer
        │
        ▼
[2] GET {issuer}/.well-known/openid-credential-issuer  → metadata (token + credential endpoint)
        │
        ▼
[3] POST token_endpoint  → tukar pre-authorized_code → access_token
        │
        ▼
[4] POST credential_endpoint + proof JWT (key binding)  → dapat SD-JWT VC
        │
        ▼
[5] Simpan SD-JWT VC ke flutter_secure_storage
```

---

## Step 1 — Daftarkan URL Scheme

### Android — `android/app/src/main/AndroidManifest.xml`

Tambahkan `<intent-filter>` di dalam `<activity>`:

```xml
<activity android:name=".MainActivity" ...>

    <!-- Deep link: OID4VCI Credential Offer -->
    <intent-filter>
        <action android:name="android.intent.action.VIEW"/>
        <category android:name="android.intent.category.DEFAULT"/>
        <category android:name="android.intent.category.BROWSABLE"/>
        <data android:scheme="openid-credential-offer"/>
    </intent-filter>

    <!-- Deep link: OID4VP (untuk presentasi, opsional) -->
    <intent-filter>
        <action android:name="android.intent.action.VIEW"/>
        <category android:name="android.intent.category.DEFAULT"/>
        <category android:name="android.intent.category.BROWSABLE"/>
        <data android:scheme="openid4vp"/>
    </intent-filter>

</activity>
```

### iOS — `ios/Runner/Info.plist`

```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>openid-credential-offer</string>
        </array>
    </dict>
</array>
```

---

## Step 2 — Tambah Dependencies

Edit `pubspec.yaml`:

```yaml
dependencies:
  flutter:
    sdk: flutter

  # Deep link / custom URL scheme handler
  app_links: ^6.0.0

  # HTTP requests
  http: ^1.2.0

  # Simpan VC dan private key dengan aman
  flutter_secure_storage: ^9.0.0

  # Crypto: P-256 untuk proof JWT
  pointycastle: ^3.9.1

  # JWT encode/decode
  jose_plus: ^0.4.0

  # QR scanner (jika belum ada)
  qr_code_scanner_plus: ^1.0.0
```

Lalu jalankan:

```bash
flutter pub get
```

---

## Step 3 — Implementasi OID4VCI Service

Buat file `lib/services/oid4vci_service.dart`:

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'holder_key_service.dart';

class Oid4VciService {

  // ----------------------------------------------------------------
  // STEP 1: Parse credential offer dari QR string
  // ----------------------------------------------------------------
  Future<Map<String, dynamic>> resolveCredentialOffer(String qrContent) async {
    final uri = Uri.parse(qrContent);

    // Case A: credential_offer_uri (by reference) — issuer kita pakai ini
    if (uri.queryParameters.containsKey('credential_offer_uri')) {
      final offerUri = Uri.decodeFull(
          uri.queryParameters['credential_offer_uri']!);
      final response = await http.get(Uri.parse(offerUri));
      if (response.statusCode != 200) {
        throw Exception(
            'Failed to fetch credential offer: ${response.statusCode}');
      }
      return jsonDecode(response.body) as Map<String, dynamic>;
    }

    // Case B: credential_offer (by value — embedded JSON)
    if (uri.queryParameters.containsKey('credential_offer')) {
      return jsonDecode(uri.queryParameters['credential_offer']!)
          as Map<String, dynamic>;
    }

    throw Exception(
        'credential_offer or credential_offer_uri not found in QR');
  }

  // ----------------------------------------------------------------
  // STEP 2: Fetch issuer metadata
  // ----------------------------------------------------------------
  Future<Map<String, dynamic>> fetchIssuerMetadata(
      String credentialIssuer) async {
    final metaUrl =
        '$credentialIssuer/.well-known/openid-credential-issuer';
    final response = await http.get(Uri.parse(metaUrl));
    if (response.statusCode != 200) {
      throw Exception(
          'Failed to fetch issuer metadata: ${response.statusCode}');
    }
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  // ----------------------------------------------------------------
  // STEP 3: Exchange pre-authorized code → access token
  // ----------------------------------------------------------------
  Future<String> exchangePreAuthCode({
    required String tokenEndpoint,
    required String preAuthorizedCode,
    String? txCode, // PIN/transaction code jika issuer meminta
  }) async {
    final body = <String, String>{
      'grant_type':
          'urn:ietf:params:oauth:grant-type:pre-authorized_code',
      'pre-authorized_code': preAuthorizedCode,
    };
    if (txCode != null) body['tx_code'] = txCode;

    final response = await http.post(
      Uri.parse(tokenEndpoint),
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: body,
    );

    if (response.statusCode != 200) {
      throw Exception(
          'Token exchange failed: ${response.statusCode}\n${response.body}');
    }

    final tokenResponse =
        jsonDecode(response.body) as Map<String, dynamic>;
    return tokenResponse['access_token'] as String;
  }

  // ----------------------------------------------------------------
  // STEP 4: Request credential dengan proof of key possession
  // ----------------------------------------------------------------
  Future<String> requestCredential({
    required String credentialEndpoint,
    required String accessToken,
    required String credentialConfigurationId,
    required String proofJwt,
  }) async {
    final requestBody = {
      'credential_configuration_id': credentialConfigurationId,
      'proof': {
        'proof_type': 'jwt',
        'jwt': proofJwt,
      },
    };

    final response = await http.post(
      Uri.parse(credentialEndpoint),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      },
      body: jsonEncode(requestBody),
    );

    if (response.statusCode != 200) {
      throw Exception(
          'Credential request failed: ${response.statusCode}\n${response.body}');
    }

    final credResponse =
        jsonDecode(response.body) as Map<String, dynamic>;
    final credential = credResponse['credential'] as String?;
    if (credential == null) {
      throw Exception('No credential in response: ${response.body}');
    }
    return credential;
  }

  // ----------------------------------------------------------------
  // FULL FLOW: QR scan → SD-JWT VC
  // ----------------------------------------------------------------
  Future<String> processCredentialOffer({
    required String qrContent,
    required HolderKeyService keyService,
    String? txCode,
  }) async {
    // 1. Resolve offer
    print('🔍 Resolving credential offer...');
    final offer = await resolveCredentialOffer(qrContent);

    final credentialIssuer = offer['credential_issuer'] as String;
    final grants = offer['grants'] as Map<String, dynamic>;
    final preAuthGrant = grants[
        'urn:ietf:params:oauth:grant-type:pre-authorized_code']
        as Map<String, dynamic>;
    final preAuthCode = preAuthGrant['pre-authorized_code'] as String;
    final credentialConfigIds =
        (offer['credential_configuration_ids'] as List).cast<String>();

    // 2. Fetch metadata
    print('📡 Fetching issuer metadata...');
    final metadata = await fetchIssuerMetadata(credentialIssuer);
    final tokenEndpoint = metadata['token_endpoint'] as String;
    final credentialEndpoint = metadata['credential_endpoint'] as String;

    // 3. Exchange token
    print('🔐 Exchanging pre-authorized code...');
    final accessToken = await exchangePreAuthCode(
      tokenEndpoint: tokenEndpoint,
      preAuthorizedCode: preAuthCode,
      txCode: txCode,
    );

    // 4. Build proof JWT
    print('🔑 Generating proof JWT...');
    final proofJwt = await keyService.createProofJwt(
      audience: credentialIssuer,
      clientId: 'flutter-bpjs-wallet',
    );

    // 5. Request credential
    print('📜 Requesting credential...');
    final sdJwtVc = await requestCredential(
      credentialEndpoint: credentialEndpoint,
      accessToken: accessToken,
      credentialConfigurationId: credentialConfigIds.first,
      proofJwt: proofJwt,
    );

    print('🎉 SD-JWT VC received! Length: ${sdJwtVc.length}');
    return sdJwtVc;
  }
}
```

---

## Step 4 — Holder Key Service (Proof of Possession)

Buat file `lib/services/holder_key_service.dart`:

```dart
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:pointycastle/export.dart';

/// Mengelola holder key pair untuk proof of key binding (OID4VCI Section 7.2.1)
/// Proof JWT dikirim ke issuer saat request credential agar VC di-bind ke key holder
class HolderKeyService {
  static const _storage = FlutterSecureStorage();
  static const _privateKeyKey = 'holder_ec_private_key_d';
  static const _publicKeyXKey = 'holder_ec_public_key_x';
  static const _publicKeyYKey = 'holder_ec_public_key_y';

  ECPrivateKey? _privateKey;
  ECPublicKey? _publicKey;

  /// Generate atau load existing P-256 key pair dari secure storage
  Future<void> ensureKeyPair() async {
    if (_privateKey != null) return;

    final storedD = await _storage.read(key: _privateKeyKey);
    final storedX = await _storage.read(key: _publicKeyXKey);
    final storedY = await _storage.read(key: _publicKeyYKey);

    if (storedD != null && storedX != null && storedY != null) {
      // Load dari storage
      final curve = ECCurve_prime256v1();
      _privateKey = ECPrivateKey(
        BigInt.parse(storedD, radix: 16),
        curve,
      );
      _publicKey = ECPublicKey(
        curve.curve.createPoint(
          BigInt.parse(storedX, radix: 16),
          BigInt.parse(storedY, radix: 16),
        ),
        curve,
      );
    } else {
      // Generate baru
      final keyPair = _generateP256KeyPair();
      _privateKey = keyPair.privateKey as ECPrivateKey;
      _publicKey = keyPair.publicKey as ECPublicKey;

      // Simpan ke secure storage
      await _storage.write(
          key: _privateKeyKey,
          value: _privateKey!.d!.toRadixString(16));
      await _storage.write(
          key: _publicKeyXKey,
          value:
              _publicKey!.Q!.x!.toBigInteger()!.toRadixString(16));
      await _storage.write(
          key: _publicKeyYKey,
          value:
              _publicKey!.Q!.y!.toBigInteger()!.toRadixString(16));
    }
  }

  /// Buat proof JWT untuk key binding (OID4VCI Section 7.2.1)
  /// Header: typ=openid4vci-proof+jwt, alg=ES256, jwk={public key}
  Future<String> createProofJwt({
    required String audience,
    required String clientId,
  }) async {
    await ensureKeyPair();

    final publicJwk = {
      'kty': 'EC',
      'crv': 'P-256',
      'x': _base64UrlEncodeBI(_publicKey!.Q!.x!.toBigInteger()!),
      'y': _base64UrlEncodeBI(_publicKey!.Q!.y!.toBigInteger()!),
    };

    final header = jsonEncode({
      'typ': 'openid4vci-proof+jwt',
      'alg': 'ES256',
      'jwk': publicJwk,
    });

    final now = DateTime.now().millisecondsSinceEpoch ~/ 1000;
    final payload = jsonEncode({
      'iss': clientId,
      'aud': audience,
      'iat': now,
      'exp': now + 300, // valid 5 menit
      'nonce': _generateNonce(),
    });

    final headerB64 = _base64UrlEncode(utf8.encode(header));
    final payloadB64 = _base64UrlEncode(utf8.encode(payload));
    final signingInput = '$headerB64.$payloadB64';

    final signature =
        _signES256(utf8.encode(signingInput), _privateKey!);
    final sigB64 = _base64UrlEncode(signature);

    return '$headerB64.$payloadB64.$sigB64';
  }

  // Generate P-256 key pair
  AsymmetricKeyPair<PublicKey, PrivateKey> _generateP256KeyPair() {
    final curve = ECCurve_prime256v1();
    final keyParams = ECKeyGeneratorParameters(curve);
    final random = FortunaRandom();
    final secureRandom = Random.secure();
    random.seed(KeyParameter(
      Uint8List.fromList(
          List.generate(32, (_) => secureRandom.nextInt(256))),
    ));

    final generator = ECKeyGenerator()
      ..init(ParametersWithRandom(keyParams, random));
    return generator.generateKeyPair();
  }

  // Sign dengan ES256 (P-256 + SHA-256)
  Uint8List _signES256(List<int> data, ECPrivateKey privateKey) {
    final signer = ECDSASigner(SHA256Digest(), HMac(SHA256Digest(), 64))
      ..init(
          true,
          ParametersWithRandom(
            PrivateKeyParameter<ECPrivateKey>(privateKey),
            SecureRandom('Fortuna'),
          ));
    final sig = signer.generateSignature(Uint8List.fromList(data))
        as ECSignature;

    // Encode sebagai raw 64-byte (R || S) untuk JWT
    final rBytes = _bigIntToBytes(sig.r, 32);
    final sBytes = _bigIntToBytes(sig.s, 32);
    return Uint8List.fromList([...rBytes, ...sBytes]);
  }

  String _base64UrlEncode(List<int> bytes) =>
      base64Url.encode(bytes).replaceAll('=', '');

  String _base64UrlEncodeBI(BigInt value) =>
      _base64UrlEncode(_bigIntToBytes(value, 32));

  Uint8List _bigIntToBytes(BigInt value, int length) {
    final hex = value.toRadixString(16).padLeft(length * 2, '0');
    return Uint8List.fromList(List.generate(
        length, (i) => int.parse(hex.substring(i * 2, i * 2 + 2), radix: 16)));
  }

  String _generateNonce() {
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    return base64Url.encode(bytes).replaceAll('=', '');
  }
}
```

---

## Step 5 — Handle Deep Link di App

Edit `lib/main.dart` atau root widget:

```dart
import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';

class WalletApp extends StatefulWidget {
  const WalletApp({super.key});
  @override
  State<WalletApp> createState() => _WalletAppState();
}

class _WalletAppState extends State<WalletApp> {
  final _appLinks = AppLinks();

  @override
  void initState() {
    super.initState();
    _initDeepLinks();
  }

  void _initDeepLinks() {
    // Handle link saat app sudah running (foreground/background)
    _appLinks.uriLinkStream.listen((uri) {
      _handleIncomingUri(uri);
    });

    // Handle link saat app di-launch dari cold start
    _appLinks.getInitialLink().then((uri) {
      if (uri != null) _handleIncomingUri(uri);
    });
  }

  void _handleIncomingUri(Uri uri) {
    final uriString = uri.toString();

    if (uriString.startsWith('openid-credential-offer://')) {
      // Navigate ke halaman penerimaan credential
      Navigator.of(context).pushNamed(
        '/receive-credential',
        arguments: {'offerUri': uriString},
      );
    } else if (uriString.startsWith('openid4vp://')) {
      // Navigate ke halaman presentasi credential (verifier)
      Navigator.of(context).pushNamed(
        '/present-credential',
        arguments: {'requestUri': uriString},
      );
    }
  }
}
```

---

## Step 6 — Halaman Receive Credential

Buat `lib/screens/receive_credential_screen.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../services/oid4vci_service.dart';
import '../services/holder_key_service.dart';

class ReceiveCredentialScreen extends StatefulWidget {
  final String offerUri;
  const ReceiveCredentialScreen({super.key, required this.offerUri});

  @override
  State<ReceiveCredentialScreen> createState() =>
      _ReceiveCredentialScreenState();
}

class _ReceiveCredentialScreenState
    extends State<ReceiveCredentialScreen> {
  final _oid4vci = Oid4VciService();
  final _keyService = HolderKeyService();
  final _storage = const FlutterSecureStorage();

  String _status = 'Memulai...';
  bool _isLoading = true;
  bool _success = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _processOffer();
  }

  Future<void> _processOffer() async {
    try {
      setState(() => _status = 'Mengambil credential offer...');
      final sdJwtVc = await _oid4vci.processCredentialOffer(
        qrContent: widget.offerUri,
        keyService: _keyService,
      );

      // Simpan SD-JWT VC ke secure storage
      setState(() => _status = 'Menyimpan credential...');
      final key = 'vc_${DateTime.now().millisecondsSinceEpoch}';
      await _storage.write(key: key, value: sdJwtVc);

      setState(() {
        _status = '✅ Credential berhasil diterima!';
        _isLoading = false;
        _success = true;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _isLoading = false;
        _status = 'Gagal';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Terima Credential')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (_isLoading) ...[
                const CircularProgressIndicator(),
                const SizedBox(height: 16),
                Text(_status),
              ] else if (_success) ...[
                const Icon(Icons.check_circle,
                    color: Colors.green, size: 80),
                const SizedBox(height: 16),
                Text(_status,
                    style: const TextStyle(fontSize: 18),
                    textAlign: TextAlign.center),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: () =>
                      Navigator.pushReplacementNamed(context, '/wallet'),
                  child: const Text('Lihat Wallet'),
                ),
              ] else ...[
                const Icon(Icons.error, color: Colors.red, size: 80),
                const SizedBox(height: 16),
                Text('Error: $_error',
                    style: const TextStyle(color: Colors.red)),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Kembali'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
```

---

## Step 7 — Parse & Tampilkan SD-JWT VC

SD-JWT VC yang diterima berbentuk string: `header.payload.signature~disclosure1~disclosure2~`

```dart
/// Parse SD-JWT VC dan tampilkan claims
Map<String, dynamic> parseSdJwt(String sdJwt) {
  // SD-JWT format: <header>.<payload>.<signature>~<disclosure1>~...
  final parts = sdJwt.split('~');
  final jwtParts = parts[0].split('.');

  if (jwtParts.length < 2) throw Exception('Invalid SD-JWT format');

  // Decode payload (base64url)
  final payloadJson = utf8.decode(
    base64Url.decode(base64Url.normalize(jwtParts[1])),
  );
  final payload = jsonDecode(payloadJson) as Map<String, dynamic>;

  // Decode disclosures (selective disclosure claims)
  final disclosures = <String, dynamic>{};
  for (int i = 1; i < parts.length; i++) {
    if (parts[i].isEmpty) continue;
    try {
      final decoded = utf8.decode(
        base64Url.decode(base64Url.normalize(parts[i])),
      );
      final arr = jsonDecode(decoded) as List;
      // Format: [salt, claim_name, claim_value]
      if (arr.length == 3) {
        disclosures[arr[1] as String] = arr[2];
      }
    } catch (_) {}
  }

  return {
    'payload': payload,
    'disclosures': disclosures,
    'vct': payload['vct'],
    // Gabungkan payload + disclosures untuk tampilan
    'claims': {...payload, ...disclosures},
  };
}
```

---

## Referensi

| Sumber | Link |
|--------|------|
| OID4VCI Spec | https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html |
| Credo-TS (Issuer) | https://github.com/openwallet-foundation/credo-ts |
| app_links package | https://pub.dev/packages/app_links |
| SD-JWT Spec | https://datatracker.ietf.org/doc/html/draft-ietf-oauth-selective-disclosure-jwt |

---

## Checklist Integrasi

- [ ] URL scheme `openid-credential-offer://` terdaftar di Android & iOS
- [ ] `app_links` handle deep link saat app running & cold start
- [ ] `HolderKeyService` generate & simpan P-256 key pair di secure storage
- [ ] `Oid4VciService.processCredentialOffer()` berhasil fetch offer dari `http://202.155.132.71:3001`
- [ ] SD-JWT VC tersimpan di `flutter_secure_storage`
- [ ] UI menampilkan claims dari SD-JWT VC
