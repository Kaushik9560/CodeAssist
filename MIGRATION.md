# V4 to V5 Migration

## Old format

CodeAssist V4 stored bookmark records in `chrome.storage.local` under `leetCodeBookmarks`:

```javascript
{
  title,
  url,
  platform,
  difficulty,
  feedback,
  date
}
```

V4 did not have a schema version, attempt records, preferences, or migration marker.

## V5 format

V5 stores a versioned object under `codeAssistV5`. Bookmarks gain stable IDs, canonical HTTPS URLs, normalized platform values, and created/updated timestamps. Attempts, active attempt reference, preferences, and migration metadata are separate fields in the same top-level object.

## Automatic migration

The service worker and every storage-service entry point call the same idempotent initialization path:

1. Read `codeAssistV5` and `leetCodeBookmarks` together.
2. Normalize an existing V5 object or create an empty schema version 5 object.
3. If `legacyBookmarksV5Completed` is false, normalize each old bookmark.
4. Preserve title, URL, platform, custom difficulty, feedback, and date.
5. Canonicalize the URL by removing query, fragment, and trailing slash.
6. Skip invalid non-HTTPS URLs and duplicate canonical URLs.
7. Save V5 state first, then mark migration complete inside that saved state.

The old `leetCodeBookmarks` key is intentionally not deleted. It remains a recovery source, but the completion marker prevents deleted V5 bookmarks from being re-imported on later launches. Re-running migration on an already migrated state does not duplicate records.

## Data-loss prevention

- Migration writes a new key rather than modifying the legacy array.
- Existing V5 bookmarks are retained and merged before the completion marker is set.
- Duplicate detection uses canonical problem URLs instead of array indexes.
- The migration test verifies repeat execution and field preservation.
- Bookmark updates and deletes operate only on stable V5 IDs.

## Important unpacked-extension ID note

Chrome storage belongs to an extension ID. Loading the new `extension/` directory can produce a different unpacked extension ID than the old folder, depending on Chrome's local extension identity behavior. Automatic migration can see V4 data only when V5 runs under the same ID and Chrome profile.

Before replacing an actively used V4 unpacked installation, export bookmarks to Excel as a user backup. If V5 receives a different ID, temporarily load V4 from its original safe source, export bookmarks, or copy the legacy `leetCodeBookmarks` value between extension storage contexts using Chrome DevTools. Do not restore the old V4 background script because it contained a compromised credential.
