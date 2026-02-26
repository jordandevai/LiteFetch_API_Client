import type { FormValues } from './requestEditorModel';

type RequestAuthTabProps = {
  authType: FormValues['auth_type'];
  authParams: FormValues['auth_params'];
  secretAuthParams: FormValues['secret_auth_params'];
  onAuthTypeChange: (next: FormValues['auth_type']) => void;
  onAuthParamsChange: (next: FormValues['auth_params']) => void;
  onSecretAuthParamsChange: (next: FormValues['secret_auth_params']) => void;
};

export const RequestAuthTab = ({
  authType,
  authParams,
  secretAuthParams,
  onAuthTypeChange,
  onAuthParamsChange,
  onSecretAuthParamsChange,
}: RequestAuthTabProps) => {
  return (
    <div className="p-4 bg-card h-full space-y-4">
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" className="accent-primary" checked={authType === 'none'} onChange={() => onAuthTypeChange('none')} />
          None
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" className="accent-primary" checked={authType === 'basic'} onChange={() => onAuthTypeChange('basic')} />
          Basic
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" className="accent-primary" checked={authType === 'bearer'} onChange={() => onAuthTypeChange('bearer')} />
          Bearer
        </label>
      </div>

      {authType === 'basic' && (
        <div className="grid grid-cols-2 gap-3 max-w-2xl">
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase text-muted-foreground">Username</label>
            <input
              className="bg-white border border-input rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              value={authParams?.username || ''}
              onChange={(e) => onAuthParamsChange({ ...authParams, username: e.target.value })}
            />
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1">
              <input
                type="checkbox"
                className="accent-primary"
                checked={Boolean(secretAuthParams?.username)}
                onChange={(e) => onSecretAuthParamsChange({ ...secretAuthParams, username: e.target.checked })}
              />
              Mark username as secret
            </label>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase text-muted-foreground">Password</label>
            <input
              type="password"
              className="bg-white border border-input rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              value={authParams?.password || ''}
              onChange={(e) => onAuthParamsChange({ ...authParams, password: e.target.value })}
            />
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1">
              <input
                type="checkbox"
                className="accent-primary"
                checked={Boolean(secretAuthParams?.password ?? true)}
                onChange={(e) => onSecretAuthParamsChange({ ...secretAuthParams, password: e.target.checked })}
              />
              Mark password as secret
            </label>
          </div>
        </div>
      )}

      {authType === 'bearer' && (
        <div className="max-w-2xl">
          <label className="text-xs uppercase text-muted-foreground">Token</label>
          <input
            className="w-full bg-white border border-input rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
            value={authParams?.token || ''}
            onChange={(e) => onAuthParamsChange({ ...authParams, token: e.target.value })}
            placeholder="eyJhbGciOi..."
          />
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1">
            <input
              type="checkbox"
              className="accent-primary"
              checked={Boolean(secretAuthParams?.token ?? true)}
              onChange={(e) => onSecretAuthParamsChange({ ...secretAuthParams, token: e.target.checked })}
            />
            Mark token as secret
          </label>
        </div>
      )}

      {authType === 'none' && (
        <p className="text-xs text-muted-foreground">No Authorization header will be added. Use Basic or Bearer to auto-insert the header.</p>
      )}
    </div>
  );
};
