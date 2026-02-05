import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || 'change-this-in-production';

// Create axios instance with config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
  },
});

// Request interceptor untuk security
apiClient.interceptors.request.use(
  (config) => {
    // Add timestamp untuk mencegah replay attacks
    config.headers['X-Request-Time'] = Date.now().toString();
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor untuk error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 429) {
      console.error('⚠️ Rate limit exceeded');
    } else if (error.response?.status === 403) {
      console.error('🚫 Access denied');
    } else if (error.code === 'ERR_NETWORK') {
      console.error('❌ Network Error - Backend mungkin tidak berjalan di:', API_BASE_URL);
    }
    return Promise.reject(error);
  }
);

export interface IssueCredentialRequest {
  documentId: string;
  documentHash: string;
  documentType: string;
  holderDID: string;
  // Data diri BPJS holder
  holderName: string;
  noBPJS: string;
  nik: string;
  tanggalLahir: string;
  alamat: string;
  metadata?: Record<string, any>;
}

export interface VerifyDocumentResponse {
  success: boolean;
  message: string;
  requestId: string;
  qrCode: string;
  requestData: any;
}

export interface IssueCredentialResponse {
  success: boolean;
  credential: any;
  message: string;
  issuedAt: string;
}

export interface ApiInfo {
  name: string;
  version: string;
  description: string;
  endpoints: Record<string, string>;
  status: string;
}

export const issuerApi = {
  // Get API info
  async getInfo(): Promise<ApiInfo> {
    const response = await apiClient.get('/');
    return response.data;
  },

  // Issue credential directly
  async verifyDocument(data: IssueCredentialRequest): Promise<VerifyDocumentResponse> {
    const response = await apiClient.post('/api/issue', data);
    return response.data;
  },

  // Issue credential (alias for compatibility)
  async issueCredential(data: IssueCredentialRequest): Promise<IssueCredentialResponse> {
    const response = await apiClient.post('/api/issue', data);
    return response.data;
  },

  // Get DID document
  async getDIDDocument() {
    const response = await apiClient.get('/.well-known/did.json');
    return response.data;
  },

  // Health check
  async healthCheck() {
    const response = await apiClient.get('/health');
    return response.data;
  },
};
