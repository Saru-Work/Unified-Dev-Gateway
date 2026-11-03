import axios from "axios";
import type { AxiosInstance } from "axios";
import https from "node:https";

export interface HttpResult {
  status: number;
  data: unknown;
}

export interface Wso2Transport {
  get(path: string, authorization?: string): Promise<HttpResult>;
  post(path: string, body: unknown, authorization: string): Promise<HttpResult>;
}

export class Wso2Client implements Wso2Transport {
  private readonly http: AxiosInstance;

  constructor(baseUrl: string, allowSelfSigned: boolean = false) {
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: 10_000,
      maxRedirects: 0,
      headers: {
        Accept: "application/json",
      },
      httpsAgent: new https.Agent({
        rejectUnauthorized: !allowSelfSigned,
      }),
    });
  }

  async get(path: string, authorization?: string): Promise<HttpResult> {
    const response = await this.http.get<unknown>(path, {
      headers: authorization
        ? {
            Authorization: authorization,
          }
        : {},
    });
    return {
      status: response.status,
      data: response.data,
    };
  }
  async post(
    path: string,
    body: unknown,
    authorization: string,
  ): Promise<HttpResult> {
    const response = await this.http.post<unknown>(path, body, {
      headers: {
        Authorization: authorization,
      },
    });
    return {
      status: response.status,
      data: response.data,
    };
  }
}
