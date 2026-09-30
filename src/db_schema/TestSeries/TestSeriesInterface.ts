export interface ITestSeries {
  /* Keys */
  pk?: string;
  sk?: string;

  exam_tag: string;
  title_en: string;
  title_hi?: string;
  description_en?: string;
  description_hi?: string;
  is_published: boolean;

  created_at?: number;
  modified_at?: number;
}
