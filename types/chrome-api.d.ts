interface ChromeEvent {
  addListener(fn: (...args: any[]) => void): void;
}

interface ChromeApi {
  runtime: {
    onInstalled: ChromeEvent;
    onStartup: ChromeEvent;
  };
  tabs: {
    query(info: object): Promise<Array<Record<string, unknown>>>;
    get(id: number): Promise<Record<string, unknown>>;
    remove(id: number): Promise<void>;
    onCreated?: ChromeEvent;
    onRemoved?: ChromeEvent;
  };
  windows: {
    getAll(): Promise<Array<Record<string, unknown>>>;
    get(id: number): Promise<Record<string, unknown>>;
    remove(id: number): Promise<void>;
    onCreated?: ChromeEvent;
    onRemoved?: ChromeEvent;
  };
  storage: {
    local: {
      get(key: string): Promise<Record<string, unknown>>;
      set(values: Record<string, unknown>): Promise<void>;
    };
    onChanged?: ChromeEvent;
  };
  action: {
    setBadgeBackgroundColor(details: { color: string }): Promise<void>;
    setBadgeText(details: { text: string }): Promise<void>;
  };
}

interface LimiterResult {
  closedTabId: number | null;
  closedWindowId: number | null;
  active: boolean | null;
  badge: string | null;
  error: any;
}

interface PopupDocument {
  getElementById(id: string): any;
}

declare var chrome: ChromeApi;
