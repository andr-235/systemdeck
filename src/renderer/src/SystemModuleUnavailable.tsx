import SystemErrorScreen from './components/SystemErrorScreen';

function SystemModuleUnavailable(): React.JSX.Element {
  return (
    <SystemErrorScreen
      title="SystemDeck"
      message="Не удалось запустить системный модуль."
      hint="Обновите окно. Если ошибка повторяется — перезапустите приложение."
      buttonLabel="Перезапустить"
      onRetry={(): void => {
        window.location.reload();
      }}
    />
  );
}

export default SystemModuleUnavailable;
