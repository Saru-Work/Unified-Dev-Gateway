function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export interface AppConfig {
  port: number;
  mongoUri: string;
  jwtSecret: string;
  wso2BaseUrl: string;
  wso2AllowSelfSigned: boolean;
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 4000),
    mongoUri: required("MONGO_URI"),
    jwtSecret: required("JWT_SECRET"),
    wso2BaseUrl:
      process.env.WSO2_BASE_URL ?? "https://localhost:9443/api/am/devportal/v3",
    // WSO2 ships with a self-signed cert; only trust it when explicitly allowed.
    wso2AllowSelfSigned: process.env.WSO2_ALLOW_SELF_SIGNED === "true",
  };
}
