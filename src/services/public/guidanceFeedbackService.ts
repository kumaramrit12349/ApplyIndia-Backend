import { ALL_TABLE_NAMES } from "../../db_schema/shared/SharedConstant";
import { GUIDANCE_MODERATION_STATUS } from "../../db_schema/GuidanceFeedback/GuidanceFeedbackConstant";
import { IGuidanceFeedback } from "../../db_schema/GuidanceFeedback/GuidanceFeedbackInterface";
import { fetchDynamoDB } from "../../Interpreter/dynamoDB/fetchCalls";
import { logErrorLocation } from "../../utils/errorUtils";

/** Fields safe to expose publicly — no user_sub/booking_sk/message-moderation metadata. */
export interface IPublicGuidanceFeedback {
  sk: string;
  rating: number;
  problem_solved: string;
  topic_tags: string[];
  message?: string;
  display_name?: string;
  featured: boolean;
  created_at: number;
}

export async function getPublicFeedback(limit: number = 30): Promise<IPublicGuidanceFeedback[]> {
  try {
    const results = await fetchDynamoDB<IGuidanceFeedback>(
      ALL_TABLE_NAMES.GuidanceFeedback,
      undefined,
      ["*"],
      { moderation_status: GUIDANCE_MODERATION_STATUS.PUBLISHED },
      "#moderation_status = :moderation_status"
    );

    return results
      .sort((a, b) => {
        if (a.featured !== b.featured) return a.featured ? -1 : 1;
        return (b.created_at || 0) - (a.created_at || 0);
      })
      .slice(0, limit)
      .map((f) => ({
        sk: f.sk!,
        rating: f.rating,
        problem_solved: f.problem_solved,
        topic_tags: f.topic_tags,
        message: f.message,
        display_name: f.display_name || "Verified Apply India User",
        featured: f.featured,
        created_at: f.created_at,
      }));
  } catch (error) {
    logErrorLocation("guidanceFeedbackService.ts", "getPublicFeedback", error, "Error fetching public guidance feedback", "", { limit });
    throw error;
  }
}
