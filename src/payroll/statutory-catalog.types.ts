import { StatutoryScheme } from '@prisma/client';
import { ContributionRules } from './calculator';
export type StatutoryCatalogEntry = {
  key: string;
  scheme: StatutoryScheme;
  category: string;
  version: string;
  effectiveFrom: string;
  effectiveTo?: string;
  sourceUrl: string;
  sourceSha256: string;
  checksumKind: 'ORIGINAL_PDF' | 'EXTRACTED_DATA';
  sourceArtifact: string;
  supportingSources?: {
    sourceUrl: string;
    sourceArtifact: string;
    sourceSha256: string;
    checksumKind: 'EXTRACTED_DATA' | 'ORIGINAL_PDF';
  }[];
  limitations: string[];
  parameters: ContributionRules;
};
