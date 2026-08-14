export type MarketingProviderMode='not_connected'|'sandbox'|'live'|'degraded';
export type MarketingProviderOperation='health'|'quote'|'validate'|'submit'|'status'|'cancel'|'events'|'tracking'|'conversion';

export type MarketingProviderContext={
  userId:string;
  campaignId?:string;
  stepId?:string;
  providerKey:string;
  idempotencyKey?:string;
  mode:MarketingProviderMode;
};

export type MarketingProviderResult<T=unknown>={
  ok:boolean;
  providerKey:string;
  operation:MarketingProviderOperation;
  normalizedStatus?:string;
  externalId?:string|null;
  vendorCostCents?:number|null;
  data?:T;
  errorCode?:string;
  errorMessage?:string;
  retryable?:boolean;
};

export type MarketingProviderAdapter={
  key:string;
  version:string;
  operations:readonly MarketingProviderOperation[];
  permissionBased?:boolean;
  requiresPerUserOAuth?:boolean;
  health(ctx:MarketingProviderContext):Promise<MarketingProviderResult>;
};

export function unsupported(providerKey:string,operation:MarketingProviderOperation):MarketingProviderResult{
  return{ok:false,providerKey,operation,errorCode:'operation_not_supported',errorMessage:`${operation} is not supported by ${providerKey}.`,retryable:false};
}

export function notConnected(providerKey:string,operation:MarketingProviderOperation):MarketingProviderResult{
  return{ok:false,providerKey,operation,errorCode:'provider_not_connected',errorMessage:'This provider is not connected yet.',retryable:false};
}

export function assertServerOperation(adapter:MarketingProviderAdapter,operation:MarketingProviderOperation){
  if(!adapter.operations.includes(operation))throw new Error(`Provider ${adapter.key} does not declare ${operation}.`);
}

// Adapters must never accept authoritative retail prices from browser payloads.
// Paid submit operations must be linked to Marketing Studio quote/payment/provider-job records.
// Permission-based email/SMS adapters must derive the normalized recipient hash server-side
// and require marketing_has_contact_consent(...) before dispatch.
