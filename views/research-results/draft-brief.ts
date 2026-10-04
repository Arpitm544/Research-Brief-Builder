export async function draftBrief({ prompt, draftInFlight, sendFollowUp, setSending, setMessage, setMessageError }: {
  prompt: string;
  draftInFlight: { current: boolean };
  sendFollowUp: (message: { prompt: string }) => Promise<unknown>;
  setSending: (sending: boolean) => void;
  setMessage: (message: string | undefined) => void;
  setMessageError: (message: string | undefined) => void;
}) {
  if (!prompt || draftInFlight.current) return;
  draftInFlight.current = true;
  setSending(true); setMessage(undefined); setMessageError(undefined);
  try { await sendFollowUp({ prompt }); setMessage("Brief requested. Continue in the conversation to see the assistant's draft."); }
  catch (error) { setMessageError(error instanceof Error ? error.message : "The host could not accept the brief request."); }
  finally { draftInFlight.current = false; setSending(false); }
}
