// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it, expect } from 'vitest';
import { validateCrossrefResponse } from '../src/backend/metadata/crossref-validation.js';

describe('validateCrossrefResponse', () => {
  describe('Valid responses', () => {
    it('should validate a complete Crossref response with required fields', () => {
      const validResponse = {
        DOI: '10.1038/nmeth.4637',
        title: 'A test article title',
        'container-title': 'Nature Methods',
        ISSN: ['1548-7091', '1548-7105'],
        published: {
          'date-parts': [[2017, 1, 1]],
        },
      };

      const result = validateCrossrefResponse(validResponse);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.item.DOI).toBe('10.1038/nmeth.4637');
        expect(result.item.title).toBe('A test article title');
        expect(result.item['container-title']).toBe('Nature Methods');
        expect(result.item.ISSN).toEqual(['1548-7091', '1548-7105']);
        expect(result.item.published['date-parts']).toEqual([[2017, 1, 1]]);
      }
    });

    it('should validate a complete Crossref response with all optional fields', () => {
      const validResponse = {
        DOI: '10.3390/ijms24032700',
        title: 'A Comprehensive Review of mRNA Vaccines',
        'container-title': 'International Journal of Molecular Sciences',
        'short-container-title': 'Int. J. Mol. Sci.',
        ISSN: ['1422-0067'],
        published: {
          'date-parts': [[2023, 1, 31]],
        },
        author: [
          { given: 'Vrinda', family: 'Gote' },
          { given: 'Pradeep Kumar', family: 'Bolla' },
        ],
        type: 'journal-article',
        volume: '24',
        issue: '3',
        page: '2700',
        URL: 'https://www.mdpi.com/1422-0067/24/3/2700',
        source: 'Crossref',
        publisher: 'MDPI AG',
      };

      const result = validateCrossrefResponse(validResponse);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.item.DOI).toBe('10.3390/ijms24032700');
        expect(result.item.title).toBe('A Comprehensive Review of mRNA Vaccines');
        expect(result.item['container-title']).toBe('International Journal of Molecular Sciences');
        expect(result.item['short-container-title']).toBe('Int. J. Mol. Sci.');
        expect(result.item.ISSN).toEqual(['1422-0067']);
        expect(result.item.published['date-parts']).toEqual([[2023, 1, 31]]);
        expect(result.item.author).toEqual([
          { given: 'Vrinda', family: 'Gote' },
          { given: 'Pradeep Kumar', family: 'Bolla' },
        ]);
        expect(result.item.type).toBe('journal-article');
        expect(result.item.volume).toBe('24');
        expect(result.item.issue).toBe('3');
        expect(result.item.page).toBe('2700');
        expect(result.item.URL).toBe('https://www.mdpi.com/1422-0067/24/3/2700');
        expect(result.item.source).toBe('Crossref');
        expect(result.item.publisher).toBe('MDPI AG');
      }
    });

    it('should handle response with multiple ISSNs', () => {
      const validResponse = {
        DOI: '10.3390/ijms24032700',
        title: 'A Comprehensive Review of mRNA Vaccines',
        'container-title': 'International Journal of Molecular Sciences',
        ISSN: ['1422-0067', '1661-6596'],
        published: {
          'date-parts': [[2023, 1, 31]],
        },
      };

      const result = validateCrossrefResponse(validResponse);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.item.ISSN).toEqual(['1422-0067', '1661-6596']);
      }
    });
  });

  describe('Missing required fields', () => {
    it('should reject response with missing DOI', () => {
      const invalidResponse = {
        title: 'A Comprehensive Review of mRNA Vaccines',
        'container-title': 'International Journal of Molecular Sciences',
        ISSN: ['1422-0067'],
        published: {
          'date-parts': [[2023, 1, 31]],
        },
      };

      const result = validateCrossrefResponse(invalidResponse);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.field).toBe('DOI');
        expect(result.error.message).toBe('Invalid input: expected string, received undefined');
      }
    });

    it('should reject response with missing title', () => {
      const invalidResponse = {
        DOI: '10.3390/ijms24032700',
        'container-title': 'International Journal of Molecular Sciences',
        ISSN: ['1422-0067'],
        published: {
          'date-parts': [[2023, 1, 31]],
        },
      };

      const result = validateCrossrefResponse(invalidResponse);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.field).toBe('title');
        expect(result.error.message).toBe('DOI found but article title is missing.');
      }
    });

    it('should reject response with missing journal title', () => {
      const invalidResponse = {
        DOI: '10.3390/ijms24032700',
        title: 'A Comprehensive Review of mRNA Vaccines',
        ISSN: ['1422-0067'],
        published: {
          'date-parts': [[2023, 1, 31]],
        },
      };

      const result = validateCrossrefResponse(invalidResponse);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.field).toBe('container-title');
        expect(result.error.message).toBe(
          'DOI found but journal title is missing. Please enter journal name manually.',
        );
      }
    });

    it('should reject response with missing ISSN', () => {
      const invalidResponse = {
        DOI: '10.3390/ijms24032700',
        title: 'A Comprehensive Review of mRNA Vaccines',
        'container-title': 'International Journal of Molecular Sciences',
        published: {
          'date-parts': [[2023, 1, 31]],
        },
      };

      const result = validateCrossrefResponse(invalidResponse);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.field).toBe('ISSN');
        expect(result.error.message).toBe(
          'DOI found but ISSN information is missing. ISSN is required for PMC deposits.',
        );
      }
    });

    it('should reject response with missing publication date', () => {
      const invalidResponse = {
        DOI: '10.3390/ijms24032700',
        title: 'A Comprehensive Review of mRNA Vaccines',
        'container-title': 'International Journal of Molecular Sciences',
        ISSN: ['1422-0067'],
      };

      const result = validateCrossrefResponse(invalidResponse);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.field).toBe('published');
        expect(result.error.message).toBe('DOI found but publication date is missing.');
      }
    });
  });

  describe('Empty values', () => {
    it('should reject response with empty title', () => {
      const invalidResponse = {
        DOI: '10.3390/ijms24032700',
        title: '',
        'container-title': 'International Journal of Molecular Sciences',
        ISSN: ['1422-0067'],
        published: {
          'date-parts': [[2023, 1, 31]],
        },
      };

      const result = validateCrossrefResponse(invalidResponse);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.field).toBe('title');
        expect(result.error.message).toBe('DOI found but article title is missing.');
      }
    });

    it('should reject response with empty journal title', () => {
      const invalidResponse = {
        DOI: '10.3390/ijms24032700',
        title: 'A Comprehensive Review of mRNA Vaccines',
        'container-title': '',
        ISSN: ['1422-0067'],
        published: {
          'date-parts': [[2023, 1, 31]],
        },
      };

      const result = validateCrossrefResponse(invalidResponse);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.field).toBe('container-title');
        expect(result.error.message).toBe(
          'DOI found but journal title is missing. Please enter journal name manually.',
        );
      }
    });

    it('should reject response with empty ISSN array', () => {
      const invalidResponse = {
        DOI: '10.3390/ijms24032700',
        title: 'A Comprehensive Review of mRNA Vaccines',
        'container-title': 'International Journal of Molecular Sciences',
        ISSN: [],
        published: {
          'date-parts': [[2023, 1, 31]],
        },
      };

      const result = validateCrossrefResponse(invalidResponse);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.field).toBe('ISSN');
        expect(result.error.message).toBe(
          'DOI found but ISSN information is missing. ISSN is required for PMC deposits.',
        );
      }
    });

    it('should reject response with empty publication date array', () => {
      const invalidResponse = {
        DOI: '10.3390/ijms24032700',
        title: 'A Comprehensive Review of mRNA Vaccines',
        'container-title': 'International Journal of Molecular Sciences',
        ISSN: ['1422-0067'],
        published: {
          'date-parts': [],
        },
      };

      const result = validateCrossrefResponse(invalidResponse);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.field).toBe('published.date-parts');
        expect(result.error.message).toBe('DOI found but publication date is missing.');
      }
    });
  });

  describe('Invalid response structures', () => {
    it('should reject completely empty response', () => {
      const invalidResponse = {};

      const result = validateCrossrefResponse(invalidResponse);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.field).toBe('DOI');
        expect(result.error.message).toBe('Invalid input: expected string, received undefined');
      }
    });

    it('should reject response with invalid structure', () => {
      const invalidResponse = {
        someRandomField: 'value',
      };

      const result = validateCrossrefResponse(invalidResponse);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.field).toBe('DOI');
        expect(result.error.message).toBe('Invalid input: expected string, received undefined');
      }
    });
  });
});
