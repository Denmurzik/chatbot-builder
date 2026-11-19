// Ошибка для нереализованных методов каркаса модулей (следующие спринты)
export class NotImplementedError extends Error {
  constructor(target?: string) {
    super(target ? `Не реализовано: ${target}` : 'Не реализовано');
    this.name = 'NotImplementedError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
