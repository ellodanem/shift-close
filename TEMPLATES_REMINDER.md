# Document Templates - Upload Reminder

## Status: Pending

The document generation system is now functional with basic templates. However, **existing document templates need to be uploaded/replaced** with the actual company templates.

## Current Templates (Placeholder)

The system currently has basic placeholder templates for:
- **Contract** - Basic employment contract template
- **Job Letter** - Employment confirmation letter template  
- **Reference Letter** - Professional reference letter template

## Action Required

1. **Locate existing templates**:
   - Contract template
   - Job Letter template
   - Reference Letter template

2. **Update templates in code**:
   - File: `app/api/staff/[id]/generate-document/route.ts`
   - Section: `TEMPLATES` object (lines ~8-60)
   - Replace placeholder templates with actual company templates

3. **Template format**:
   - Use placeholders: `{{name}}`, `{{dateOfBirth}}`, `{{startDate}}`, `{{role}}`, `{{date}}`
   - Templates are plain text (can include line breaks)
   - Will be displayed in editable textarea before printing

## Template Placeholders Available

- `{{name}}` - Staff member's full name
- `{{dateOfBirth}}` - Formatted date of birth
- `{{startDate}}` - Formatted employment start date
- `{{role}}` - Staff role (capitalized)
- `{{date}}` - Current date (when document is generated)

## Future Enhancement

Consider moving templates to database or config file for easier updates without code changes.

