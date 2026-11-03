import type { HttpResult, Wso2Transport } from "../integrations/wso2/client";

interface CreateApplicationInput {
  name: string;
  description: string;
}
export class Wso2ApplicationService {
  constructor(private readonly client: Wso2Transport) {}

  create(
    input: CreateApplicationInput,
    authorization: string,
  ): Promise<HttpResult> {
    return this.client.post(
      "/applications",
      {
        name: input.name,
        description: input.description,
        throttlingPolicy: "Unlimited",
        tokenType: "JWT",
      },
      authorization,
    );
  }
}
