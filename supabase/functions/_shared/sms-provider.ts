// SMS Provider Abstraction Layer
// Supports ClickSend and Twilio

export interface SMSSendResult {
  success: boolean;
  messageId?: string;
  httpStatus: number;
  body: unknown;
}

export interface SMSProvider {
  send(to: string, message: string): Promise<SMSSendResult>;
}

// ── ClickSend Provider ─────────────────────────────────────────────────────

class ClickSendProvider implements SMSProvider {
  private username: string;
  private apiKey: string;
  private from: string;

  constructor(username: string, apiKey: string, from: string) {
    this.username = username;
    this.apiKey = apiKey;
    this.from = from;
  }

  async send(to: string, message: string): Promise<SMSSendResult> {
    const credentials = btoa(`${this.username}:${this.apiKey}`);

    const payload = {
      messages: [
        {
          to,
          body: message,
          source: "sms-reminders",
          from: this.from,
        },
      ],
    };

    const res = await fetch("https://rest.clicksend.com/v3/sms/send", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseBody = await res.json().catch(() => null);
    const success =
      res.status === 200 &&
      responseBody?.data?.messages?.[0]?.status === "SUCCESS";

    return {
      success,
      messageId: responseBody?.data?.messages?.[0]?.message_id,
      httpStatus: res.status,
      body: responseBody,
    };
  }
}

// ── Twilio Provider ────────────────────────────────────────────────────────

class TwilioProvider implements SMSProvider {
  private accountSid: string;
  private authToken: string;
  private from: string;

  constructor(accountSid: string, authToken: string, from: string) {
    this.accountSid = accountSid;
    this.authToken = authToken;
    this.from = from;
  }

  async send(to: string, message: string): Promise<SMSSendResult> {
    const credentials = btoa(`${this.accountSid}:${this.authToken}`);

    const body = new URLSearchParams({
      To: to,
      From: this.from,
      Body: message,
    });

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      }
    );

    const responseBody = await res.json().catch(() => null);
    const success = res.status === 201 && !responseBody?.code;

    return {
      success,
      messageId: responseBody?.sid,
      httpStatus: res.status,
      body: responseBody,
    };
  }
}

// ── Factory ────────────────────────────────────────────────────────────────

export function createSmsProvider(
  provider: string,
  config: Record<string, string>
): SMSProvider {
  switch (provider.toLowerCase()) {
    case "clicksend":
      return new ClickSendProvider(
        config.CLICKSEND_USERNAME,
        config.CLICKSEND_API_KEY,
        config.CLICKSEND_FROM || "SMSReminder"
      );

    case "twilio":
      return new TwilioProvider(
        config.TWILIO_ACCOUNT_SID,
        config.TWILIO_AUTH_TOKEN,
        config.TWILIO_FROM
      );

    default:
      throw new Error(
        `Unknown SMS provider: ${provider}. Supported: clicksend, twilio`
      );
  }
}
