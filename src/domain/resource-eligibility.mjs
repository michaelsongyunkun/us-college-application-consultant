function combinedText(item) {
  const requirements = Array.isArray(item.requirements) ? item.requirements : [item.requirements];
  return [
    item.name,
    item.format,
    item.formatAndWebsite,
    item.description,
    item.rawRating,
    ...requirements,
    item.eligibilityNote,
    item.raw,
  ]
    .filter(Boolean)
    .join(" ");
}

function hasKnownUsStatusRestriction(item) {
  return /\bJSHS\b|Junior Science and Humanities Symposia/i.test(String(item?.name || ""));
}

function statesNoUsStatus(filters) {
  const identityText = `${filters.nationality || ""} ${filters.identityDescription || ""}`;
  return /(?:无|没有|不具备|非|不是)[^。；，,\n]{0,16}(?:美国公民|美国永久居民|永久居民|绿卡)/i.test(
    identityText,
  );
}

function statesOutsideUsHighSchool(filters) {
  if (["mainland_china_high_school", "outside_us_high_school"].includes(filters.schoolContext)) {
    return true;
  }
  return /(?:中国大陆|中国内地|国内|非美高|非美国高中|不在美国)[^。；，,\n]{0,12}(?:高中|中学|就读)/i.test(
    filters.identityDescription || "",
  );
}

function statesMainlandChinaHighSchool(filters) {
  if (filters.schoolContext === "mainland_china_high_school") return true;
  return /(?:中国大陆|中国内地|大陆)[^。；，,\n]{0,12}(?:高中|中学|在读)/i.test(
    filters.identityDescription || "",
  );
}

export function enrichResourceEligibility(item) {
  const text = combinedText(item);
  const hasOnline = /线上|online|virtual/i.test(text);
  const hasOffline = /线下|on-campus|in[- ]person|residential/i.test(text);
  const inferredMode = hasOnline && hasOffline
    ? "hybrid"
    : hasOnline
      ? "online"
      : hasOffline
        ? "offline"
        : "unknown";
  const usOnly =
    hasKnownUsStatusRestriction(item) ||
    /(?:仅|限)[^。；，,\n]{0,12}(?:美国公民|美籍|美国永久居民|永久居民|绿卡)|U\.?S\.?\s*(?:citizen|permanent resident).{0,12}only/i.test(
      text,
    );
  const internationalOpen =
    /接受国际生|国际生可|对国际生开放|不限国籍|international students? (?:are )?(?:eligible|welcome|accepted)/i.test(text);
  const mainlandChinaExcluded =
    /不(?:接受|招收|面向|开放给?)中国(?:大陆|内地)(?:高中)?生/i.test(text);
  const usHighSchoolOnly =
    /(?:仅|限)[^。；，,\n]{0,14}(?:(?:美国|纽约市|纽约都会区|纽黑文)[^。；，,\n]{0,18}(?:公立|独立|当地|地区|low-income\s*)?(?:高中|高中生)|美高(?:学生|学子)?)/i.test(text) ||
    /美国(?:顶尖)?高中生(?:团队)?(?:独立科研赛|团队编程邀请赛)/i.test(text);
  const restricted = /身份受限|资格受限|eligibility restricted/i.test(text);
  const internationalPaidTrackOnly =
    /(?:商业版|付费|paid)\s*(?:版|track)?[^。；，,\n]{0,24}(?:国际生|international students?)[^。；，,\n]{0,12}(?:开放|eligible|accepted)|(?:国际生|international students?)[^。；，,\n]{0,24}(?:商业版|付费|paid)\s*(?:版|track)?/i.test(text)
    && /免费\s*track[^。；，,\n]{0,30}(?:限|仅|面向)[^。；，,\n]{0,18}(?:美国|美籍|公民|永久居民|underrepresented)/i.test(text);
  const inferredStatus = mainlandChinaExcluded
    ? "mainland_china_excluded"
    : internationalOpen
      ? "open_to_international"
      : usOnly
        ? "us_status_only"
        : usHighSchoolOnly
          ? "us_high_school_only"
      : restricted
        ? "restricted"
        : "unknown";

  return {
    ...item,
    participationMode: item.participationMode || inferredMode,
    eligibilityStatus: item.eligibilityStatus || inferredStatus,
    eligibilityNote:
      item.eligibilityNote ||
      (internationalPaidTrackOnly
        ? "国际生仅适用于付费 track；免费 track 的录取率、截止日期与资助信息不适用，需核验付费 track 最新要求"
        : inferredStatus === "mainland_china_excluded"
        ? "不接受中国大陆高中生申请"
        : inferredStatus === "open_to_international"
          ? "接受国际生"
          : inferredStatus === "us_status_only"
            ? "仅美国公民或永久居民可申请"
            : inferredStatus === "us_high_school_only"
              ? "仅限美国境内指定高中或地区学生申请"
              : inferredStatus === "restricted"
                ? "资格限制待核实"
                : "资格信息未明确"),
  };
}

export function hasEligibilityConditions(filters = {}) {
  return Boolean(
    String(filters.nationality || "").trim() ||
      String(filters.identityDescription || "").trim() ||
      String(filters.schoolContext || "").trim() ||
      String(filters.participationPreference || "").trim(),
  );
}

export function classifyResource(item, filters = {}) {
  const reasons = [];
  const notices = [];

  if (filters.participationPreference === "online_only" && item.participationMode === "offline") {
    reasons.push("仅提供线下参与，与仅线上条件冲突");
  }
  if (filters.participationPreference === "offline_only" && item.participationMode === "online") {
    reasons.push("仅提供线上参与，与仅线下条件冲突");
  }
  if (item.eligibilityStatus === "us_status_only" && statesNoUsStatus(filters)) {
    reasons.push("仅美国公民或永久居民可申请");
  }
  if (item.eligibilityStatus === "us_high_school_only" && statesOutsideUsHighSchool(filters)) {
    reasons.push("仅限美国境内指定高中或地区学生申请");
  }
  if (item.eligibilityStatus === "mainland_china_excluded" && statesMainlandChinaHighSchool(filters)) {
    reasons.push("不接受中国大陆高中生申请");
  }

  return {
    excluded: reasons.length > 0,
    reasons,
    notices,
  };
}
