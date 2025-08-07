==========================================================================================================================
 scan and add Items into Box Validation.
==========================================================================================================================

Scenario 1: Empty box

✅ Any item can be added (first item sets the "rules" for the box)

Scenario 2: Box contains items from is_grouping = false rooms only

✅ Items from other is_grouping = false rooms can be added freely
❌ Items from is_grouping = true rooms cannot be added

Scenario 3: Box contains items from is_grouping = true room

❌ Items from any other room cannot be added
✅ Items from the same room with same group can be added
❌ Items from the same room with different group cannot be added

Key principle: Once a box contains items from a grouping-enabled room, it becomes "locked" to that specific room and group. Conversely, items from grouping-enabled rooms cannot be added to boxes that already contain items from non-grouping rooms.
This prevents mixing of controlled (grouping-enabled) and uncontrolled (grouping-disabled) items in the same box.

==========================================================================================================================

