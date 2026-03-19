// eslint-disable-next-line import/no-extraneous-dependencies
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as yamlLoad } from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
import { generateTramline, type Activity } from '../src/common/tramstops/tramstops.js';
import {
  PMC_DEPOSIT_WORKFLOW,
  PMC_CRITICAL_PATH_STATES,
  PMC_MUTUALLY_EXCLUSIVE_STATES,
} from '../src/workflows.js';
import { TOY_WORKFLOW, TOY_MUTUALLY_EXCLUSIVE_STATES } from './toy-workflow.js';
import type { TramStop } from '../src/components/StatusTramline.js';

// Types for YAML test configuration
interface TestConfig {
  test_cases: TestCase[];
}

interface TestCase {
  name: string;
  description: string;
  current_status: string | null;
  activities: Activity[];
  expected_tramline: ExpectedTramStop[];
}

interface ExpectedTramStop {
  status: string;
  completed: boolean;
  error: boolean;
  warning: boolean;
  subtitle?: string;
}

// Load configs at module level
let minimalConfig: TestConfig | null = null;
let completeConfig: TestConfig | null = null;

try {
  // Load minimal test configuration (uses toy workflow)
  const minimalYamlPath = join(__dirname, 'tramstop-test-cases-minimal.yml');
  const minimalYamlContent = readFileSync(minimalYamlPath, 'utf8');
  minimalConfig = yamlLoad(minimalYamlContent) as TestConfig;

  // Load complete test configuration (uses real PMC workflow)
  const completeYamlPath = join(__dirname, 'tramstop-test-cases-complete.yml');
  const completeYamlContent = readFileSync(completeYamlPath, 'utf8');
  completeConfig = yamlLoad(completeYamlContent) as TestConfig;
} catch (error) {
  console.error('Failed to load test configuration:', error);
  minimalConfig = null;
  completeConfig = null;
}

describe('generateTramline - YAML Test Suite', () => {
  // Helper function to run a test case with toy workflow
  function runToyTestCase(testCase: TestCase) {
    const result = generateTramline(
      TOY_WORKFLOW,
      testCase.current_status === null ? undefined : testCase.current_status,
      testCase.activities,
      ['START', 'PROCESSING', 'APPROVED', 'COMPLETED'], // Toy workflow critical path
      TOY_MUTUALLY_EXCLUSIVE_STATES as unknown as Record<string, string | string[]>, // Toy workflow mutually exclusive states
      '2025-10-02T15:21:30.538Z', // submissionLastModified
    );

    return { result, testCase };
  }

  // Helper function to run a test case with PMC workflow
  function runPMCTestCase(testCase: TestCase) {
    const result = generateTramline(
      PMC_DEPOSIT_WORKFLOW,
      testCase.current_status === null ? undefined : testCase.current_status,
      testCase.activities,
      [...PMC_CRITICAL_PATH_STATES], // PMC workflow critical path
      PMC_MUTUALLY_EXCLUSIVE_STATES as unknown as Record<string, string | string[]>, // PMC workflow mutually exclusive states
      '2025-10-02T15:21:30.538Z', // submissionLastModified
    );

    return { result, testCase };
  }

  // Helper function to validate tramline structure
  function validateTramlineStructure(tramline: TramStop[], expected: ExpectedTramStop[]) {
    expect(tramline).toHaveLength(expected.length);

    tramline.forEach((stop, index) => {
      const expectedStop = expected[index];
      // Compare only the fields that are in the expected object (exclude title)
      expect(stop.status).toBe(expectedStop.status);
      expect(stop.completed).toBe(expectedStop.completed);
      expect(stop.error).toBe(expectedStop.error);
      expect(stop.warning).toBe(expectedStop.warning);
      if (expectedStop.subtitle !== undefined) {
        expect(stop.subtitle).toBe(expectedStop.subtitle);
      }
    });
  }

  // Test configuration loading
  describe('Configuration Loading', () => {
    it('should load test configurations successfully', () => {
      expect(minimalConfig).not.toBeNull();
      expect(completeConfig).not.toBeNull();

      if (minimalConfig) {
        expect(minimalConfig.test_cases).toBeDefined();
      }

      if (completeConfig) {
        expect(completeConfig.test_cases).toBeDefined();
      }
    });
  });

  // Minimal Test Cases (using toy workflow)
  describe('Minimal Test Cases - Toy Workflow', () => {
    if (!minimalConfig || !minimalConfig.test_cases) {
      it.skip('should run minimal test cases with toy workflow if config is loaded', () => {
        console.log('Skipping minimal test cases - config not loaded');
      });
    } else {
      // Create individual test cases for each YAML test case
      it.each(
        minimalConfig.test_cases.map((testCase): [string, TestCase] => [testCase.name, testCase]),
      )('should handle test case: %s', (testName, testCase) => {
        const { result } = runToyTestCase(testCase);

        // Basic structure validation
        expect(result).toBeDefined();
        expect(Array.isArray(result.tramline)).toBe(true);
        expect(typeof result.ended).toBe('boolean');

        // Validate the actual expected behavior
        // This will fail with empty implementation - that's expected for now
        validateTramlineStructure(result.tramline, testCase.expected_tramline);
      });
    }
  });

  // Complete Test Cases (using real PMC workflow)
  describe('Complete Test Cases - PMC Workflow', () => {
    if (!completeConfig || !completeConfig.test_cases) {
      it.skip('should run complete test cases with PMC workflow if config is loaded', () => {
        console.log('Skipping complete test cases - config not loaded');
      });
    } else {
      // Create individual test cases for each YAML test case
      it.each(
        completeConfig.test_cases.map((testCase): [string, TestCase] => [testCase.name, testCase]),
      )('should handle test case: %s', (testName, testCase) => {
        const { result } = runPMCTestCase(testCase);

        // Basic structure validation
        expect(result).toBeDefined();
        expect(Array.isArray(result.tramline)).toBe(true);
        expect(typeof result.ended).toBe('boolean');

        // Validate the actual expected behavior
        // This will fail with empty implementation - that's expected for now
        validateTramlineStructure(result.tramline, testCase.expected_tramline);
      });
    }
  });

  // Edge Case Tests
  describe('Edge Cases', () => {
    it('should handle empty activities array', () => {
      const result = generateTramline(
        PMC_DEPOSIT_WORKFLOW,
        'PENDING',
        [],
        [...PMC_CRITICAL_PATH_STATES],
        PMC_MUTUALLY_EXCLUSIVE_STATES as unknown as Record<string, string | string[]>,
        '2025-10-02T15:21:30.538Z',
      );
      expect(result.tramline).toHaveLength(7);
      expect(result.ended).toBe(false);
    });

    it('should handle unknown current status', () => {
      const result = generateTramline(
        PMC_DEPOSIT_WORKFLOW,
        'UNKNOWN_STATUS',
        [],
        [...PMC_CRITICAL_PATH_STATES],
        PMC_MUTUALLY_EXCLUSIVE_STATES as unknown as Record<string, string | string[]>,
        '2025-10-02T15:21:30.538Z',
      );
      expect(result.tramline).toHaveLength(1);
      expect(result.ended).toBe(true);
      expect(result.tramline[0].status).toBe('UNKNOWN_STATUS');
      expect(result.tramline[0].title).toBe('Unknown Status: UNKNOWN_STATUS');
      expect(result.tramline[0].completed).toBe(true);
      expect(result.tramline[0].error).toBe(true);
      expect(result.tramline[0].warning).toBe(false);
    });

    it('should handle empty workflow states', () => {
      const emptyWorkflow = {
        version: 1,
        name: 'EMPTY_WORKFLOW',
        label: 'Empty Workflow for Testing',
        initialState: 'START',
        states: {},
        transitions: [],
      };
      const result = generateTramline(
        emptyWorkflow,
        'START',
        [],
        [],
        {},
        '2025-10-02T15:21:30.538Z',
      );
      expect(result.tramline).toHaveLength(0);
      expect(result.ended).toBe(false);
    });
  });
});
