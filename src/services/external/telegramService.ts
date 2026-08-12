import axios from "axios";
import { TELEGRAM_CONFIG } from "../../config/env";
import { logErrorLocation } from "../../utils/errorUtils";
import { IExternalSendResult } from "./types";

/**
 * Publishes a message to the configured Apply India Telegram channel via
 * the Telegram Bot API. Requires the bot to already be added as an admin
 * of that channel with permission to post.
 * No-ops (skipped) if TELEGRAM_CONFIG isn't set.
 */
export async function sendTelegramMessage(text: string): Promise<IExternalSendResult> {
  const { botToken, channelId } = TELEGRAM_CONFIG;
  if (!botToken || !channelId) {
    return { success: false, skipped: true };
  }
  try {
    const response = await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: channelId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    });
    return { success: true, id: String(response.data?.result?.message_id) };
  } catch (error: any) {
    logErrorLocation("telegramService.ts", "sendTelegramMessage", error, "Failed to publish Telegram message", "", { channelId });
    return { success: false, error: error?.response?.data?.description || error?.message || "Telegram send failed" };
  }
}
