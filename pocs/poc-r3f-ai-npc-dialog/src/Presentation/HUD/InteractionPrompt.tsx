// Aviso de proximidade: aparece quando o avatar entra no raio de um prédio ou de um NPC. aria-live anuncia ao
// leitor de tela.
export function InteractionPrompt({ label, hint }: { label: string | null; hint: string }) {
  return (
    <div className="prompt-region" aria-live="polite">
      {label && (
        <div className="prompt" data-testid="interaction-prompt">
          <strong>{label}</strong>
          <span>{hint}</span>
        </div>
      )}
    </div>
  );
}
