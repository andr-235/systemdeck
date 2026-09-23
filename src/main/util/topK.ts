/**
 * Сохраняет не более `limit` элементов с наибольшими value.
 * Минимальная куча по value: при переполнении вытесняется корень (наименьший
 * из удерживаемых). O(log limit) на добавление.
 */
export class BoundedTopK<T> {
  private readonly values: number[] = [];
  private readonly items: T[] = [];
  private readonly limit: number;

  constructor(limit: number) {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error(`BoundedTopK: limit must be a positive integer, got ${limit}`);
    }
    this.limit = limit;
  }

  get size(): number {
    return this.values.length;
  }

  add(value: number, item: T): void {
    if (this.values.length < this.limit) {
      this.values.push(value);
      this.items.push(item);
      this.heapifyUp(this.values.length - 1);
      return;
    }
    if (value > this.values[0]) {
      this.values[0] = value;
      this.items[0] = item;
      this.heapifyDown(0);
    }
  }

  /** Элементы в порядке убывания value (крупнейший первый). */
  snapshot(): T[] {
    return this.items
      .map((item, index) => ({ item, value: this.values[index] }))
      .sort((a, b) => b.value - a.value)
      .map((entry) => entry.item);
  }

  private heapifyUp(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.values[parent] <= this.values[index]) {
        return;
      }
      this.swap(index, parent);
      index = parent;
    }
  }

  private heapifyDown(index: number): void {
    const size = this.values.length;
    while (true) {
      const left = 2 * index + 1;
      const right = 2 * index + 2;
      let smallest = index;
      if (left < size && this.values[left] < this.values[smallest]) {
        smallest = left;
      }
      if (right < size && this.values[right] < this.values[smallest]) {
        smallest = right;
      }
      if (smallest === index) {
        return;
      }
      this.swap(index, smallest);
      index = smallest;
    }
  }

  private swap(indexA: number, indexB: number): void {
    const tmpValue = this.values[indexA];
    this.values[indexA] = this.values[indexB];
    this.values[indexB] = tmpValue;
    const tmpItem = this.items[indexA];
    this.items[indexA] = this.items[indexB];
    this.items[indexB] = tmpItem;
  }
}