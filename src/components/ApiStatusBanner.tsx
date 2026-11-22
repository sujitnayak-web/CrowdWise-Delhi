import { AlertCircle, RefreshCw } from 'lucide-react';

interface ApiStatusBannerProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ApiStatusBanner({
  title = 'Backend connection unavailable',
  message,
  onRetry,
}: ApiStatusBannerProps) {
  return (
    <div
      role="alert"
      className="cw-card p-4 sm:p-5 border-[#D4563A]/45 bg-[#F6FAF3] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
    >
      <div className="flex items-start gap-3">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-[8px] bg-[#D4563A]/12 text-[#D4563A] shrink-0 mt-0.5">
          <AlertCircle className="h-4 w-4" strokeWidth={1.5} />
        </span>
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-[#14261C]">{title}</p>
          <p className="text-xs sm:text-[13px] text-[#5C6F62] leading-relaxed">{message}</p>
        </div>
      </div>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-[8px] border border-[#CFDCC8] bg-[#E8F0E4] text-xs font-medium text-[#1F4D3A] hover:border-[#1F4D3A] hover:bg-[#1F4D3A] hover:text-[#F6FAF3] transition-colors shrink-0 self-start sm:self-auto"
        >
          <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span>Retry</span>
        </button>
      )}
    </div>
  );
}
