// Default questionnaire transcribed from Furnix_CRM_Walkin_Lead_Questionnaire.xlsx.
// Workbook field order, wording, options and mandatory flags are preserved.
export const walkinLeadDefaults = {
  "kitchen": {
    "title": "Kitchen",
    "questions": [
      {
        "key": "kitchen_1",
        "label": "How often do you cook or entertain at home?",
        "type": "single_select",
        "required": true,
        "options": [
          "Daily",
          "Often",
          "Rarely"
        ],
        "sort_order": 1
      },
      {
        "key": "kitchen_2",
        "label": "Who primarily uses the kitchen?",
        "type": "single_select",
        "required": true,
        "options": [
          "Yourself",
          "Maid",
          "Both"
        ],
        "sort_order": 2
      },
      {
        "key": "kitchen_3",
        "label": "Do you have any specific preferences for modular accessories?",
        "type": "text",
        "required": true,
        "options": [],
        "sort_order": 3
      },
      {
        "key": "kitchen_4",
        "label": "Is there a particular aesthetic or theme you're aiming for?",
        "type": "text",
        "required": true,
        "options": [],
        "sort_order": 4
      },
      {
        "key": "kitchen_5",
        "label": "What challenges do you face in your current kitchen?",
        "type": "text",
        "required": true,
        "options": [],
        "sort_order": 5
      },
      {
        "key": "kitchen_6",
        "label": "Are you looking to keep the same layout or make changes?",
        "type": "single_select",
        "required": true,
        "options": [
          "Same Layout",
          "Require Changes"
        ],
        "sort_order": 6
      },
      {
        "key": "kitchen_7",
        "label": "What factor is most important in your decision-making?",
        "type": "single_select",
        "required": true,
        "options": [
          "Design",
          "Quality",
          "Storage",
          "Budget",
          "Delivery Time"
        ],
        "sort_order": 7
      },
      {
        "key": "kitchen_8",
        "label": "What type of kitchen are you interested in?",
        "type": "single_select",
        "required": true,
        "options": [
          "Budget-Friendly",
          "Concept-Based",
          "Premium"
        ],
        "sort_order": 8
      },
      {
        "key": "kitchen_9",
        "label": "What is your estimated budget?",
        "type": "single_select",
        "required": true,
        "options": [
          "₹2.5L–₹3.5L",
          "₹4L–₹6L",
          "₹8L+"
        ],
        "sort_order": 9
      }
    ]
  },
  "wardrobe": {
    "title": "Wardrobe",
    "questions": [
      {
        "key": "wardrobe_1",
        "label": "Who will primarily use the wardrobe?",
        "type": "multi_select",
        "required": true,
        "options": [
          "Individual",
          "Couple",
          "Kids",
          "Shared"
        ],
        "sort_order": 1
      },
      {
        "key": "wardrobe_2",
        "label": "Do you have any specific storage requirements?",
        "type": "text",
        "required": true,
        "options": [],
        "sort_order": 2
      },
      {
        "key": "wardrobe_3",
        "label": "Do you have any preference for wardrobe accessories?",
        "type": "text",
        "required": true,
        "options": [],
        "sort_order": 3
      },
      {
        "key": "wardrobe_4",
        "label": "Is there a particular aesthetic or theme you're aiming for?",
        "type": "text",
        "required": true,
        "options": [],
        "sort_order": 4
      },
      {
        "key": "wardrobe_5",
        "label": "What challenges do you face with your current wardrobe?",
        "type": "text",
        "required": true,
        "options": [],
        "sort_order": 5
      },
      {
        "key": "wardrobe_6",
        "label": "What factor is most important in your decision-making?",
        "type": "single_select",
        "required": true,
        "options": [
          "Design",
          "Storage",
          "Quality",
          "Budget",
          "Finish"
        ],
        "sort_order": 6
      },
      {
        "key": "wardrobe_7",
        "label": "What type of wardrobe are you interested in?",
        "type": "single_select",
        "required": true,
        "options": [
          "Budget-Friendly",
          "Concept-Based",
          "Premium"
        ],
        "sort_order": 7
      },
      {
        "key": "wardrobe_8",
        "label": "What is your estimated budget?",
        "type": "single_select",
        "required": true,
        "options": [
          "₹1.5L–₹2.5L",
          "₹2.5L–₹4L",
          "₹4L+"
        ],
        "sort_order": 8
      }
    ]
  },
  "office_furniture": {
    "title": "Office Furniture",
    "questions": [
      {
        "key": "office_furniture_1",
        "label": "What type of office furniture are you looking for?",
        "type": "multi_select",
        "required": true,
        "options": [
          "Workstations",
          "Cabins",
          "Meeting Tables",
          "Storage",
          "Reception",
          "Other"
        ],
        "sort_order": 1
      },
      {
        "key": "office_furniture_2",
        "label": "Approximately how many people need to be accommodated?",
        "type": "number",
        "required": true,
        "options": [],
        "sort_order": 2,
        "min": 1,
        "integer": true
      },
      {
        "key": "office_furniture_3",
        "label": "Is this for a new office or renovation?",
        "type": "single_select",
        "required": true,
        "options": [
          "New Office",
          "Renovation",
          "Expansion"
        ],
        "sort_order": 3
      },
      {
        "key": "office_furniture_4",
        "label": "Do you have any specific storage requirements?",
        "type": "text",
        "required": true,
        "options": [],
        "sort_order": 4
      },
      {
        "key": "office_furniture_5",
        "label": "Is there a particular design/theme you're aiming for?",
        "type": "text",
        "required": true,
        "options": [],
        "sort_order": 5
      },
      {
        "key": "office_furniture_6",
        "label": "What factor is most important in your decision-making?",
        "type": "single_select",
        "required": true,
        "options": [
          "Design",
          "Durability",
          "Budget",
          "Ergonomics",
          "Delivery Time"
        ],
        "sort_order": 6
      },
      {
        "key": "office_furniture_7",
        "label": "Do you have a floor plan or office layout available?",
        "type": "single_select",
        "required": true,
        "options": [
          "Yes",
          "No"
        ],
        "sort_order": 7
      },
      {
        "key": "office_furniture_8",
        "label": "What is your estimated furniture budget?",
        "type": "single_select",
        "required": true,
        "options": [
          "Below ₹5L",
          "₹5L–₹10L",
          "₹10L–₹25L",
          "₹25L+"
        ],
        "sort_order": 8
      }
    ]
  },
  "tv_unit_console": {
    "title": "TV Unit - Console",
    "questions": [
      {
        "key": "tv_unit_console_1",
        "label": "What type of unit are you looking for?",
        "type": "single_select",
        "required": true,
        "options": [
          "TV Unit",
          "Console",
          "Entertainment Unit",
          "Other"
        ],
        "sort_order": 1
      },
      {
        "key": "tv_unit_console_2",
        "label": "Where will the unit be placed?",
        "type": "single_select",
        "required": true,
        "options": [
          "Living Room",
          "Bedroom",
          "Foyer",
          "Other"
        ],
        "sort_order": 2
      },
      {
        "key": "tv_unit_console_3",
        "label": "Do you require storage in the unit?",
        "type": "single_select",
        "required": true,
        "options": [
          "Yes",
          "No"
        ],
        "sort_order": 3
      },
      {
        "key": "tv_unit_console_4",
        "label": "Do you have any specific functional requirements?",
        "type": "text",
        "required": true,
        "options": [],
        "sort_order": 4
      },
      {
        "key": "tv_unit_console_5",
        "label": "Is there a particular aesthetic or theme you're aiming for?",
        "type": "text",
        "required": true,
        "options": [],
        "sort_order": 5
      },
      {
        "key": "tv_unit_console_6",
        "label": "Do you have a reference design or image?",
        "type": "file",
        "required": true,
        "options": [],
        "sort_order": 6,
        "accepted_mime_types": [
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/gif",
          "application/pdf"
        ],
        "max_files": 5,
        "max_file_size_bytes": 10485760
      },
      {
        "key": "tv_unit_console_7",
        "label": "What factor is most important in your decision-making?",
        "type": "single_select",
        "required": true,
        "options": [
          "Design",
          "Storage",
          "Quality",
          "Budget"
        ],
        "sort_order": 7
      },
      {
        "key": "tv_unit_console_8",
        "label": "What is your estimated budget?",
        "type": "single_select",
        "required": true,
        "options": [
          "Below ₹50K",
          "₹50K–₹1L",
          "₹1L–₹2L",
          "₹2L+"
        ],
        "sort_order": 8
      }
    ]
  },
  "other_furniture": {
    "title": "Other Furniture",
    "questions": [
      {
        "key": "other_furniture_1",
        "label": "What type of furniture are you looking for?",
        "type": "single_select",
        "required": true,
        "options": [
          "Study Unit",
          "Crockery Unit",
          "Bar Unit",
          "Bed",
          "Shoe Rack",
          "Other"
        ],
        "sort_order": 1
      },
      {
        "key": "other_furniture_2",
        "label": "Which room or area is it for?",
        "type": "single_select",
        "required": true,
        "options": [
          "Living Room",
          "Bedroom",
          "Dining",
          "Study",
          "Foyer",
          "Other"
        ],
        "sort_order": 2
      },
      {
        "key": "other_furniture_3",
        "label": "What is the primary requirement for this furniture?",
        "type": "text",
        "required": true,
        "options": [],
        "sort_order": 3
      },
      {
        "key": "other_furniture_4",
        "label": "Do you have any specific storage or functional requirements?",
        "type": "text",
        "required": true,
        "options": [],
        "sort_order": 4
      },
      {
        "key": "other_furniture_5",
        "label": "Is there a particular aesthetic or theme you're aiming for?",
        "type": "text",
        "required": true,
        "options": [],
        "sort_order": 5
      },
      {
        "key": "other_furniture_6",
        "label": "Do you have a reference design or image?",
        "type": "file",
        "required": true,
        "options": [],
        "sort_order": 6,
        "accepted_mime_types": [
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/gif",
          "application/pdf"
        ],
        "max_files": 5,
        "max_file_size_bytes": 10485760
      },
      {
        "key": "other_furniture_7",
        "label": "What factor is most important in your decision-making?",
        "type": "single_select",
        "required": true,
        "options": [
          "Design",
          "Functionality",
          "Quality",
          "Budget"
        ],
        "sort_order": 7
      },
      {
        "key": "other_furniture_8",
        "label": "What is your estimated budget?",
        "type": "single_select",
        "required": true,
        "options": [
          "Below ₹50K",
          "₹50K–₹1L",
          "₹1L–₹2.5L",
          "₹2.5L+"
        ],
        "sort_order": 8
      }
    ]
  }
} as const;
