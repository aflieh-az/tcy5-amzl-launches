# Requirements Document — TCY5 AMZL Lane Launches

## Introduction

This document defines the requirements for launching 3 new AMZL sortable lanes at the TCY5 (Tracy, CA) sort center. The lanes route packages from TCY9 to delivery stations DCK6, DFA5, and DSR2. The MFO Engineer must assign physical sort chutes on the TCY5 floor to these new routes, validate volume constraints, update the STEM allocation file, and coordinate physical floor changes — all while respecting existing lane boundaries, chute naming conventions, waves and volume guardrails.

A 4th lane is pending SIM results from Param/Sacheta and is out of scope for this initial launch.

## Glossary

- **TCY5**: Amazon sort center located in Tracy, CA — the facility where these lane launches occur.
- **TCY9**: Upstream sort center originating the new AMZL routes.
- **AMZL**: Amazon Logistics — last-mile delivery network.
- **Lane**: A physical grouping of sort chutes on the TCY5 floor assigned to a delivery station route.
- **Chute**: A physical sort destination on the floor identified by a numeric ID (e.g., 20501). Packages are inducted and diverted to chutes.
- **D2C_Chute**: A chute whose ID ends in `-FLAT`, used exclusively for smalls (direct-to-container).
- **Multi_Chute**: A chute whose ID does NOT end in `-FLAT`, used for pallet build with large or mixed packages.
- **ADV**: Average Daily Volume — the expected number of packages per day for a given route.
- **SPAO**: Sort Plan Allocation Optimization — tool that generates chute-to-route assignment recommendations.
- **STEM**: Bulk upload system that stores the active chute-to-route sortation rules. Single source of truth for chute assignments.
- **SPOT**: System providing ADV data per route.
- **VSM**: Visual Sort Map — visual representation of chute assignments on the floor.
- **5S_Square**: Floor marking indicating the staging location for a container or pallet at a chute.
- **NC_Signage**: Non-conveyable signage — physical signs on the floor identifying non-conveyable package handling areas.
- **PanD2C_Flip**: The process of converting a Multi_Chute to a D2C_Chute (or vice versa) by changing its physical configuration.
- **ARSC**: Amazon Robotics Sort Center chute prefix.
- **Noncon**: Non-conveyable packages — items too large or irregular for the automated sorter.
- **Change_Overview**: A summary document listing all physical and system changes required for a lane launch (chute flips, new signage, new 5S_Square locations).
- **Sortation_Rules_File**: The STEM-formatted file containing all chute-to-route mappings for TCY5.
- **Floor_Layout_Grid**: A spatial grid representation of the TCY5 floor showing wave groups, zones, chute IDs, and route assignments.

## Requirements

### Requirement 1: Pull and Validate SPOT Volume Data

**User Story:** As an MFO Engineer, I want to pull ADV data from SPOT for the 3 new AMZL routes, so that I have accurate volume figures to drive chute assignment decisions.

#### Acceptance Criteria

1. WHEN the MFO Engineer initiates a lane launch for routes TCY9→DCK6-CYC1, TCY9→DFA5-CYC1, and TCY9→DSR2-CYC1, THE Lane_Launch_System SHALL retrieve ADV data from SPOT for each route broken down by Smalls, Noncon, and Large volume categories.
2. THE Lane_Launch_System SHALL display the following validated ADV figures for each route:
   - TCY9→DCK6-CYC1: Total 1,987 (Smalls 1,418, Noncon 58, Large 511)
   - TCY9→DFA5-CYC1: Total 2,476 (Smalls 1,943, Noncon 24, Large 509)
   - TCY9→DSR2-CYC1: Total 3,033 (Smalls 2,231, Noncon 98, Large 704)
3. IF SPOT data is unavailable or incomplete for any of the 3 routes, THEN THE Lane_Launch_System SHALL alert the MFO Engineer and prevent proceeding to chute assignment until valid ADV data is provided.

### Requirement 2: Generate Chute-to-Route Assignments via SPAO

**User Story:** As an MFO Engineer, I want to run SPAO to generate recommended chute-to-route assignments for the new lanes, so that I have an optimized starting point for floor layout design.

#### Acceptance Criteria

1. WHEN the MFO Engineer triggers SPAO for the 3 new AMZL routes, THE Lane_Launch_System SHALL generate chute-to-route assignment recommendations using the validated ADV data.
2. THE Lane_Launch_System SHALL assign new AMZL lanes only to lanes 5, 6, 7, 12, 19, or 20 on the TCY5 floor.
3. THE Lane_Launch_System SHALL exclude chutes 20105, 20106, 21605, and 21606 from assignments for AMZL lanes 5 and 6.
4. THE Lane_Launch_System SHALL assign chutes ending in `-FLAT` exclusively to Smalls volume and chutes NOT ending in `-FLAT` exclusively to Large or mixed volume.

### Requirement 3: Enforce Chute Volume Capacity

**User Story:** As an MFO Engineer, I want the system to enforce the 1,800 ADV maximum per chute, so that no single chute is overloaded and package flow remains manageable.

#### Acceptance Criteria

1. THE Lane_Launch_System SHALL validate that no single chute assignment exceeds 1,800 ADV.
2. WHEN a chute assignment would exceed 1,800 ADV, THE Lane_Launch_System SHALL automatically create a duplicate chute assignment to split the volume across two chutes for the same route.
3. IF the MFO Engineer manually overrides a chute assignment that exceeds 1,800 ADV without creating a duplicate, THEN THE Lane_Launch_System SHALL display a warning indicating the volume cap violation and the affected chute ID.

### Requirement 4: Design Floor Layout with Spatial Grid

**User Story:** As an MFO Engineer, I want to design the floor layout for the new lanes using a spatial grid format, so that the layout accurately reflects the physical arrangement of chutes on the TCY5 floor.

#### Acceptance Criteria

1. THE Lane_Launch_System SHALL render chute assignments in a spatial grid format matching the physical TCY5 floor layout, not as a flat table.
2. WHEN the MFO Engineer places new AMZL lane assignments, THE Lane_Launch_System SHALL display each chute with its chute ID, assigned route code, and ADV within the grid cell.
3. THE Lane_Launch_System SHALL preserve existing assignments for Chico (ARSC-21620, pallet build, non-FLAT), Facebook smalls (ARSC-20220-FLAT, D2C), and Facebook large in their current positions.
4. THE Lane_Launch_System SHALL respect physical lane boundaries so that chute assignments do not span across lane dividers.

### Requirement 5: Produce Change Overview

**User Story:** As an MFO Engineer, I want to generate a Change Overview document listing all physical and system changes, so that Ops and stakeholders know exactly what needs to happen on the floor.

#### Acceptance Criteria

1. WHEN the MFO Engineer finalizes the floor layout for the 3 new lanes, THE Lane_Launch_System SHALL generate a Change_Overview listing:
   - Which chutes require a PanD2C_Flip (converting between D2C_Chute and Multi_Chute)
   - New 5S_Square locations for each affected chute
   - New NC_Signage placements for non-conveyable handling areas
2. THE Lane_Launch_System SHALL identify each change by chute ID, lane number, and the type of change (PanD2C_Flip, 5S_Square relocation, NC_Signage addition).
3. IF no physical changes are required for a given lane, THEN THE Lane_Launch_System SHALL explicitly state that no floor changes are needed for that lane in the Change_Overview.

### Requirement 6: Update STEM Allocation File

**User Story:** As an MFO Engineer, I want to update the STEM allocation file with the new chute-to-route mappings, so that the sortation system routes packages to the correct chutes on launch day.

#### Acceptance Criteria

1. WHEN the MFO Engineer approves the final chute-to-route assignments, THE Lane_Launch_System SHALL generate an updated Sortation_Rules_File in STEM-compatible format containing all new and existing mappings.
2. THE Lane_Launch_System SHALL preserve all existing chute-to-route mappings in the Sortation_Rules_File that are not affected by the new lane launches.
3. THE Lane_Launch_System SHALL validate that the updated Sortation_Rules_File contains no duplicate chute-to-route entries unless the duplication is intentional for volume splitting per Requirement 3.
4. IF the generated Sortation_Rules_File contains a formatting error or missing required field, THEN THE Lane_Launch_System SHALL reject the file and display the specific validation error to the MFO Engineer.


### Requirement 7: Validate STEM File as Single Source of Truth

**User Story:** As an MFO Engineer, I want the STEM file to be treated as the single source of truth for all chute assignments, so that there is no ambiguity about which routes are active on the floor.

#### Acceptance Criteria

1. THE Lane_Launch_System SHALL use the Sortation_Rules_File as the authoritative source for all current chute-to-route mappings when loading or displaying floor state.
2. WHEN a discrepancy exists between the Floor_Layout_Grid and the Sortation_Rules_File, THE Lane_Launch_System SHALL flag the discrepancy and prompt the MFO Engineer to reconcile before proceeding.
3. THE Lane_Launch_System SHALL not allow chute-to-route assignments to be saved to the Floor_Layout_Grid without a corresponding entry in the Sortation_Rules_File.

### Requirement 8: Coordinate Ops Readiness for Physical Floor Changes

**User Story:** As an MFO Engineer, I want to generate an Ops coordination checklist tied to the launch date (3/22-23), so that physical floor changes are completed before the new lanes go live.

#### Acceptance Criteria

1. WHEN the Change_Overview is finalized, THE Lane_Launch_System SHALL generate an Ops coordination checklist itemizing each physical change with the responsible party and target completion date.
2. THE Lane_Launch_System SHALL include confirmation checkboxes for NC floor layout updates and AR floor layout updates in the Ops coordination checklist.
3. IF any checklist item is not marked complete by the launch date, THEN THE Lane_Launch_System SHALL display a warning indicating incomplete physical readiness for the affected lane.

### Requirement 9: Confirm NC and AR Floor Layout Updates

**User Story:** As an MFO Engineer, I want to confirm that both the NC (non-conveyable) and AR (Amazon Robotics) floor layouts are updated to reflect the new lanes, so that all package types are routed correctly on launch day.

#### Acceptance Criteria

1. WHEN the MFO Engineer marks the lane launch as ready for go-live, THE Lane_Launch_System SHALL require confirmation that the NC floor layout has been updated to reflect new NC_Signage and chute assignments.
2. WHEN the MFO Engineer marks the lane launch as ready for go-live, THE Lane_Launch_System SHALL require confirmation that the AR floor layout has been updated to reflect new chute assignments and 5S_Square locations.
3. IF either the NC or AR floor layout confirmation is missing, THEN THE Lane_Launch_System SHALL block the go-live status and display which layout confirmation is outstanding.
