import { describe, it, expect } from 'vitest';
import { orFilterForSearch } from './searchTerm';

describe('orFilterForSearch', () => {
  it('matches the term against title and description', () => {
    expect(orFilterForSearch('desk')).toBe('title.ilike."%desk%",description.ilike."%desk%"');
  });

  it('survives a comma, which otherwise separates PostgREST conditions', () => {
    // Unquoted, "desk, chair" would split the or() into three broken filters.
    expect(orFilterForSearch('desk, chair')).toBe(
      'title.ilike."%desk, chair%",description.ilike."%desk, chair%"',
    );
  });

  it('survives parentheses, which otherwise group conditions', () => {
    expect(orFilterForSearch('lamp (ikea)')).toBe(
      'title.ilike."%lamp (ikea)%",description.ilike."%lamp (ikea)%"',
    );
  });

  it('strips LIKE wildcards so they are not treated as operators', () => {
    expect(orFilterForSearch('50%_off')).toBe('title.ilike."%50off%",description.ilike."%50off%"');
  });

  it('strips quotes and backslashes that would break out of the quoted value', () => {
    expect(orFilterForSearch('a"b\\c')).toBe('title.ilike."%abc%",description.ilike."%abc%"');
  });

  it('returns null for an empty or whitespace-only query', () => {
    expect(orFilterForSearch('')).toBeNull();
    expect(orFilterForSearch('   ')).toBeNull();
  });

  it('returns null when a query is only wildcards, rather than matching everything', () => {
    expect(orFilterForSearch('%%')).toBeNull();
  });
});
