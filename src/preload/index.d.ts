declare global {
  interface Window {
    lmas: import('./api-types').LmasApi
  }
}

export {}
