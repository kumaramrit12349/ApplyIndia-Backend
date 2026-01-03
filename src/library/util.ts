import { ulid } from "ulid";

export function generateId(): string {
  return ulid();
}

export function buildNotificationDetail(items: any[]): any {
  const result: any = {};

  for (const item of items) {
    const sk: string = item.sk;
    if (sk.endsWith("#META")) {
      Object.assign(result, {
        sk: item.sk,
        title: item.title,
        category: item.category,
        department: item.department,
        total_vacancies: item.total_vacancies,
        start_date: item.start_date,
        last_date_to_apply: item.last_date_to_apply,
        exam_date: item.exam_date,
        has_syllabus: item?.has_syllabus,
        has_admit_card: item?.has_admit_card,
        has_result: item?.has_result,
        has_answer_key: item?.has_answer_key,
        created_at: item.created_at,
        modified_at: item.modified_at,
        approved_at: item.approved_at,
        approved_by: item.approved_by,
      });
    }

    if (sk.endsWith("#DETAILS")) {
      result.details = {
        short_description: item.short_description,
        long_description: item.long_description,
        important_date_details: item.important_date_details,
      };
    }

    if (sk.endsWith("#ELIGIBILITY")) {
      result.eligibility = {
        min_age: item.min_age,
        max_age: item.max_age,
        qualification: item.qualification,
        specialization: item.specialization,
        min_percentage: item.min_percentage,
        age_relaxation_details: item.age_relaxation_details,
      };
    }

    if (sk.endsWith("#FEE")) {
      result.fee = {
        general_fee: item.general_fee,
        obc_fee: item.obc_fee,
        sc_fee: item.sc_fee,
        st_fee: item.st_fee,
        ph_fee: item.ph_fee,
        other_fee_details: item.other_fee_details,
      };
    }

    if (sk.endsWith("#LINKS")) {
      result.links = {
        apply_online_url: item.apply_online_url,
        official_website_url: item.official_website_url,
        notification_pdf_url: item.notification_pdf_url,
        admit_card_url: item.admit_card_url,
        answer_key_url: item.answer_key_url,
        result_url: item.result_url,
        youtube_link: item.youtube_link,
        other_links: item.other_links,
      };
    }
  }

  return result;
}

export function toEpoch(date: string | number | null | undefined): number | undefined {
  // Allow empty / optional dates
  if (date === null || date === undefined || date === "") {
    return undefined;
  }

  // Already epoch
  if (typeof date === "number") {
    if (!Number.isFinite(date)) {
      throw new Error(`Invalid epoch value: ${date}`);
    }
    return date;
  }

  if (typeof date !== "string") {
    throw new Error(`Unsupported date type: ${typeof date}`);
  }

  // Normalize YYYY-MM-DD to UTC midnight
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? `${date}T00:00:00Z`
    : date;

  const epoch = Date.parse(normalized);

  if (Number.isNaN(epoch)) {
    throw new Error(`Invalid date format: ${date}`);
  }

  return epoch;
}



