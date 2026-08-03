export const composeCommitMessage = (summary: string, description: string): string => {
  const head = summary.trim();
  const body = description.trim();
  return body ? `${head}\n\n${body}` : head;
};
