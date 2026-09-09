# Calendar locale export

### Requirement: Export dates using the requested locale

The calendar CSV export SHALL format each event date with the caller's requested locale and UTC date components. It SHALL preserve the event order and CSV column names.

#### Scenario: Locale changes date order

- **WHEN** a caller exports an event with locale `en-US`
- **THEN** the date column uses the locale's month/day/year order while retaining the same UTC calendar date

#### Scenario: The default locale is used

- **WHEN** a caller omits a locale
- **THEN** the exporter uses the documented `en-CA` default and does not change the event order
