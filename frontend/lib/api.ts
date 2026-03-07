import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || 'change-this-in-production';

// Axios instance for admin endpoints (with API key)
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
  },
});

// Axios instance for public OID4VCI endpoints (no API key)
const publicClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    config.headers['X-Request-Time'] = Date.now().toString();
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 429) console.error('⚠️ Rate limit exceeded');
    else if (error.response?.status === 403) console.error('🚫 Access denied');
    else if (error.code === 'ERR_NETWORK') console.error(`❌ Network Error — Backend di ${API_BASE_URL} tidak dapat dijangkau`);
    return Promise.reject(error);
  }
);

// ============================================
// Type Definitions
// ============================================

export interface CredentialOfferResponse {
  success: boolean;
  offerId: string;
  credentialOfferUri: string;
  qrCode: string;
  expiresAt: string;
}

export interface RegisterHolderRequest {
  nik: string;
  nama: string;
  tanggalLahir: string;
  password: string;
}

export interface AuthorizeRequest {
  nik: string;
  password: string;
  client_id: string;
  redirect_uri: string;
  state?: string;
}

export interface AuthorizeResponse {
  success: boolean;
  code: string;
  state?: string;
  redirect_uri: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface CredentialResponse {
  format: string;
  credential: string;
}

export interface ApiInfo {
  name: string;
  version: string;
  description: string;
  endpoints: Record<string, string>;
  credentialFormat: string;
  flow: string;
  status: string;
}

export interface HealthCheckResponse {
  status: string;
  database: string;
  issuerDID: string;
  timestamp: string;
}

export interface StatsResponse {
  success: boolean;
  statistics: Record<string, any>;
}

// ============================================
// Admin API (requires API key)
// ============================================

export const issuerApi = {
  /** Get server info */
  async getInfo(): Promise<ApiInfo> {
    const response = await apiClient.get('/');
    return response.data;
  },

  /** Create credential offer (admin) → returns QR code */
  async createCredentialOffer(): Promise<CredentialOfferResponse> {
    const response = await apiClient.post('/credential-offer');
    return response.data;
  },

  /** Get credential offer by ID */
  async getCredentialOffer(offerId: string) {
    const response = await publicClient.get(`/credential-offer/${offerId}`);
    return response.data;
  },

  /** Get statistics (admin) */
  async getStatistics(): Promise<StatsResponse> {
    const response = await apiClient.get('/api/stats');
    return response.data;
  },

  /** Health check */
  async healthCheck(): Promise<HealthCheckResponse> {
    const response = await publicClient.get('/health');
    return response.data;
  },

  /** Get issuer metadata */
  async getIssuerMetadata() {
    const response = await publicClient.get('/.well-known/openid-credential-issuer');
    return response.data;
  },
};

// ============================================
// Holder API (public OID4VCI endpoints)
// ============================================

export const holderApi = {
  /** Register holder (NIK + password) */
  async register(data: RegisterHolderRequest) {
    const response = await publicClient.post('/register', data);
    return response.data;
  },

  /** Authorize (login as holder → get auth code) */
  async authorize(data: AuthorizeRequest): Promise<AuthorizeResponse> {
    const response = await publicClient.post('/authorize', data);
    return response.data;
  },

  /** Exchange auth code for access token */
  async exchangeToken(code: string): Promise<TokenResponse> {
    const response = await publicClient.post('/token', {
      grant_type: 'authorization_code',
      code,
    });
    return response.data;
  },

  /** Request credential with access token */
  async requestCredential(accessToken: string): Promise<CredentialResponse> {
    const response = await publicClient.post(
      '/credential',
      {
        format: 'jwt_vc_json',
        credential_definition: {
          type: ['VerifiableCredential', 'IdentityCredential'],
        },
      },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    return response.data;
  },
};
