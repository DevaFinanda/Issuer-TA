import axios from 'axios';

const ENV_API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || '').trim();

function resolveApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    return ENV_API_BASE_URL || 'http://localhost:3001';
  }

  const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const apiLooksLocal = ENV_API_BASE_URL.includes('localhost') || ENV_API_BASE_URL.includes('127.0.0.1');
  const mixedContentRisk = window.location.protocol === 'https:' && ENV_API_BASE_URL.startsWith('http://');

  // In production browser context, prefer same-origin proxy path to avoid
  // mixed-content/CORS issues when env is not configured correctly.
  if (!isLocalHost && (!ENV_API_BASE_URL || apiLooksLocal || mixedContentRisk)) {
    return `${window.location.origin}/api`;
  }

  return ENV_API_BASE_URL || `${window.location.origin}/api`;
}

const API_BASE_URL = resolveApiBaseUrl();
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
  nama?: string;
  tanggal_lahir?: string;
  email?: string;
  password: string;
}

export interface AuthorizeRequest {
  identifier: string;
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

export interface ManagedCredential {
  id: string;
  holderName: string;
  holderDID: string | null;
  format: string;
  status: string;
  issuedAt: string;
  validUntil: string;
}

export interface ManagedCredentialDetail {
  id: string;
  holderDID: string | null;
  holderName: string;
  nik: string;
  nama: string;
  tanggalLahir?: string | null;
  format: string;
  status: string;
  issuerDID: string;
  issuerName: string;
  issuedAt: string;
  validFrom: string;
  validUntil: string;
  revokedAt?: string | null;
  revokedReason?: string | null;
}

export interface CredentialsListResponse {
  success: boolean;
  credentials: ManagedCredential[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface HoldersSummaryItem {
  id: string;
  nik: string | null;
  email: string;
  nama: string;
  isActive: boolean;
  holderDID: string | null;
  credentialCount: number;
  lastIssuedAt: string | null;
}

export interface HoldersSummaryResponse {
  success: boolean;
  holders: HoldersSummaryItem[];
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

  /** List credentials (admin) */
  async getCredentials(params?: { page?: number; limit?: number; status?: string }): Promise<CredentialsListResponse> {
    const response = await apiClient.get('/api/credentials', { params });
    return response.data;
  },

  /** Credential detail (admin) */
  async getCredentialDetail(id: string): Promise<{ success: boolean; credential: ManagedCredentialDetail }> {
    const response = await apiClient.get(`/api/credentials/${id}`);
    return response.data;
  },

  /** Revoke credential (admin) */
  async revokeCredential(id: string, reason?: string): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.post(`/api/credentials/${id}/revoke`, { reason });
    return response.data;
  },

  /** Suspend credential (admin) */
  async suspendCredential(id: string, reason?: string): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.post(`/api/credentials/${id}/suspend`, { reason });
    return response.data;
  },

  /** Extend credential expiration (admin) */
  async extendCredentialExpiry(id: string, validUntil: string): Promise<{ success: boolean; message: string; validUntil: string }> {
    const response = await apiClient.post(`/api/credentials/${id}/extend-expiry`, { validUntil });
    return response.data;
  },

  /** Delete credential permanently (admin) */
  async deleteCredential(id: string): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.delete(`/api/credentials/${id}`);
    return response.data;
  },

  /** Holder list and summary (admin) */
  async getHolders(): Promise<HoldersSummaryResponse> {
    const response = await apiClient.get('/api/holders');
    return response.data;
  },

  /** Delete holder permanently (admin) */
  async deleteHolder(id: string): Promise<{ success: boolean; message: string }> {
    const response = await apiClient.delete(`/api/holders/${id}`);
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
    const response = await publicClient.post('/oid4vci/authorize', data);
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
          type: ['VerifiableCredential', 'KartuBPJSKesehatan'],
        },
      },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    return response.data;
  },
};
