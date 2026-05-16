import type { AiAccessKeyDto, AiHitlMode, AiKeyEnvironment, AiKeyPermission, AiKeyTestStatus } from './services/apiTypes';

export type Hitl = AiHitlMode;

export interface ApiKeyView {
  id: string;
  provider: string;
  key: string;
  secret: string;
  env: AiKeyEnvironment;
  permissions: AiKeyPermission;
  label: string;
  show: boolean;
  testing: boolean;
  lastTest: AiKeyTestStatus | null;
  canReveal: boolean;
  canCopy: boolean;
  hitl?: Hitl;
  maxSingle?: number;
  maxDaily?: number;
  allowed?: string;
  expires?: string;
  lastUsedLabel?: string;
}

export function formatLastUsed(value: string | null) {
  if (!value) return '';
  return value.slice(0, 16).replace('T', ' ');
}

function dateOnly(value: string | null | undefined) {
  return value ? value.slice(0, 10) : '';
}

function dtoFields(dto: AiAccessKeyDto) {
  return {
    id: dto.id,
    provider: dto.provider,
    key: dto.maskedKey,
    secret: '',
    env: dto.environment,
    permissions: dto.permission,
    label: dto.label,
    lastTest: dto.lastTest,
    canReveal: false,
    canCopy: false,
    hitl: dto.hitl,
    maxSingle: dto.riskLimits?.maxSingleUsd,
    maxDaily: dto.riskLimits?.maxDailyUsd,
    allowed: dto.riskLimits?.allowedSymbols.join(',') ?? '',
    expires: dateOnly(dto.riskLimits?.expiresAt),
    lastUsedLabel: formatLastUsed(dto.lastUsedAt),
  };
}

export function keyFromDto(dto: AiAccessKeyDto): ApiKeyView {
  return {
    ...dtoFields(dto),
    show: false,
    testing: false,
  };
}

export function mergeKeyDtoIntoView(target: ApiKeyView, dto: AiAccessKeyDto) {
  Object.assign(target, dtoFields(dto));
}
