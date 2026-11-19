// Тёмная тема — класс .dark на <html> по системной настройке, с подпиской на изменения
export function applySystemTheme(): () => void {
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = (dark: boolean): void => {
    document.documentElement.classList.toggle('dark', dark);
  };
  apply(query.matches);
  const listener = (event: MediaQueryListEvent): void => apply(event.matches);
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
