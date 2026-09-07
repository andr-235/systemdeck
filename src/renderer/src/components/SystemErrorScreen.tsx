type SystemErrorScreenProps = {
  title: string;
  message: string;
  hint?: string;
  buttonLabel: string;
  onRetry: () => void;
};

function SystemErrorScreen({
  title,
  message,
  hint,
  buttonLabel,
  onRetry,
}: SystemErrorScreenProps): React.JSX.Element {
  return (
    <main className="sd-system-error" role="alert">
      <h1 className="sd-system-error-title">{title}</h1>
      <p className="sd-system-error-message">{message}</p>
      {hint && <p className="sd-system-error-hint">{hint}</p>}
      <button type="button" className="sd-button" onClick={onRetry}>
        {buttonLabel}
      </button>
    </main>
  );
}

export default SystemErrorScreen;
