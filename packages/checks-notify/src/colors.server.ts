export type CheckSlackSeverity = 'success' | 'info' | 'warning' | 'error';

export function colorForSeverity(severity: CheckSlackSeverity): 'good' | 'warning' | 'danger' {
  switch (severity) {
    case 'success':
    case 'info':
      return 'good';
    case 'warning':
      return 'warning';
    case 'error':
      return 'danger';
  }
}
