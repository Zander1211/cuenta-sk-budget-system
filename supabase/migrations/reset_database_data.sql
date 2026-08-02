Please replace all Year Dropdown filters throughout the system with the same Year Numeric Spinner used on the Main Dashboard.

Objective

Standardize the Year Filter across the entire system by using one reusable Year Numeric Spinner component instead of different dropdowns.

This will provide a more professional, consistent, and scalable user interface.

Reusable Component

Use the same Year Numeric Spinner component that is already implemented on the Main Dashboard.

Do not create separate versions for different pages.

All pages should reuse the exact same component so that future updates only need to be made once.

Replace Year Filters

Replace the existing Year Dropdown with the Year Numeric Spinner on every page that currently has a Year Filter, including but not limited to:

Budget Page

Replace the Year Dropdown with the Year Numeric Spinner.

Changing the year should immediately refresh:

Monthly Budgets
Budget Summary
Budget Tables
Budget Charts (if any)
AI Analysis

Replace the existing Year Filter with the shared Year Numeric Spinner (if not already using the shared component).

Expense Summary

For:

SK Chairman
SK Treasurer
SK Kagawad
Barangay Treasurer

Replace the Year Dropdown with the Year Numeric Spinner.

Dashboard

Ensure it continues using the shared Year Numeric Spinner component.

Any Other Page

Search the entire application for any page that uses a Year Filter.

Replace every Year Dropdown with the shared Year Numeric Spinner.

Examples include:

Reports
Financial Reports
Analytics
Documents
Audit Trail
Backup History
Restore History
Any future page that filters by year
Year Range

Support years from:

Minimum: 2000
Maximum: 2100

Users should be able to:

Click Previous Year
Click Next Year
Type a year manually
Use keyboard arrow keys
Default Value

The default year should always be the current year unless a previously selected year has been saved for that specific page.

Synchronization

Whenever the year changes:

Refresh the current page automatically.
Update all tables.
Update all charts.
Update all summary cards.
Update all statistics.
Filter every query using the selected year.

No page refresh should be required.

Empty Data Handling

If there are no records for the selected year:

Display ₱0 where appropriate.
Show professional "No data available" messages.
Do not display records from another year.
UI/UX Requirements

The Year Numeric Spinner should:

Match the Main Dashboard exactly.
Have consistent spacing, typography, and styling.
Be responsive on desktop, tablet, and mobile devices.
Be compact and professional.
Align properly with Month selectors and other filter controls.
Expected Result

Every page in the system that uses a Year Filter should use the same reusable Year Numeric Spinner. The interface should be consistent across the application, automatically update data when the year changes, and provide a clean, professional user experience on all devices.