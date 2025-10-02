import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import type pino from 'pino';

interface ApiClientOptions {
  baseURL: string;
  email: string;
  password: string;
  logger: pino.Logger;
}

interface IntakePayload {
  title: string;
  description?: string;
  intakeForm?: Record<string, unknown>;
  customerId?: string;
  deviceId?: string;
  assigneeId?: string;
}

interface AuditPayload {
  messageId: string;
  sender: string;
  intent: string;
  response?: string;
  metadata?: Record<string, unknown>;
}

export class ApiClient {
  private readonly http: AxiosInstance;
  private token: string | null = null;
  private readonly logger: pino.Logger;
  private readonly email: string;
  private readonly password: string;

  constructor(options: ApiClientOptions) {
    this.logger = options.logger.child({ module: 'ApiClient' });
    this.http = axios.create({
      baseURL: options.baseURL,
      timeout: 15000,
    });
    this.email = options.email;
    this.password = options.password;
  }

  get isConfigured(): boolean {
    return Boolean(this.email && this.password);
  }

  async createIntakeTicket(payload: IntakePayload): Promise<AxiosResponse | null> {
    return this.request('post', '/tickets/intake', payload);
  }

  async getTicket(ticketId: string): Promise<AxiosResponse | null> {
    return this.request('get', `/tickets/${ticketId}`);
  }

  async logMessage(payload: AuditPayload): Promise<AxiosResponse | null> {
    return this.request('post', '/bot/messages', payload);
  }

  private async request(
    method: AxiosRequestConfig['method'],
    url: string,
    data?: unknown,
    retry = true,
  ): Promise<AxiosResponse | null> {
    if (!this.isConfigured) {
      this.logger.warn({ url }, 'API credentials missing, skipping request');
      return null;
    }

    await this.ensureToken();

    try {
      const response = await this.http.request({
        method,
        url: `/api${url.startsWith('/') ? url : `/${url}`}`,
        data,
        headers: {
          Authorization: this.token ? `Bearer ${this.token}` : undefined,
        },
      });
      return response;
    } catch (error) {
      if (retry && axios.isAxiosError(error) && error.response?.status === 401) {
        this.logger.warn({ url }, 'API token expired, refreshing');
        this.token = null;
        await this.ensureToken();
        return this.request(method, url, data, false);
      }

      this.logger.error({ err: error, url }, 'API request failed');
      throw error;
    }
  }

  private async ensureToken() {
    if (this.token || !this.isConfigured) {
      return;
    }

    this.logger.info('requesting API token');
    const response = await this.http.post('/api/auth/login', {
      email: this.email,
      password: this.password,
    });
    const token = response.data?.token;
    if (typeof token !== 'string' || !token) {
      throw new Error('Invalid login response from API');
    }

    this.token = token;
    this.logger.info('API token acquired');
  }
}
