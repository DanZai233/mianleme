function looksLikeUrl(value: string) {
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function cleanMeetingId(value: string) {
  const trimmed = value.trim();
  const separatorIndex = trimmed.search(/[:：]/);
  if (separatorIndex >= 0 && separatorIndex <= 30) {
    return trimmed.slice(separatorIndex + 1).trim();
  }
  return trimmed;
}

export function normalizeParsedInterviewResult(data: any) {
  if (!data || typeof data !== "object") {
    return data;
  }

  const link = String(data.link || "").trim();
  const meetingId = String(data.meetingId || "").trim();

  if (!meetingId && link && !looksLikeUrl(link)) {
    return {
      ...data,
      link: "",
      meetingId: cleanMeetingId(link),
    };
  }

  return {
    ...data,
    link,
    meetingId,
  };
}
