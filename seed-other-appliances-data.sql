-- Seed data for OtherAppliancesMaster (Others tab -> Stone / Appliances /
-- Sinks / Faucets forms). Targets vendor_id = 1. 5 entries per type (20 rows).

INSERT INTO "OtherAppliancesMaster" (vendor_id, type, article_number, description)
VALUES
    -- Stone
    (1, 'Stone', 'STN-001', 'Black Galaxy Granite - Polished Finish'),
    (1, 'Stone', 'STN-002', 'White Quartz - Calacatta Pattern'),
    (1, 'Stone', 'STN-003', 'Grey Marble - Honed Finish'),
    (1, 'Stone', 'STN-004', 'Beige Travertine - Matte Finish'),
    (1, 'Stone', 'STN-005', 'Absolute Black Quartz - Polished Finish'),

    -- Appliances
    (1, 'Appliances', 'APL-001', 'Built-in Chimney - 90cm Auto Clean'),
    (1, 'Appliances', 'APL-002', 'Built-in Hob - 4 Burner Glass Top'),
    (1, 'Appliances', 'APL-003', 'Built-in Oven - 60L Convection'),
    (1, 'Appliances', 'APL-004', 'Built-in Microwave - 28L'),
    (1, 'Appliances', 'APL-005', 'Built-in Dishwasher - 12 Place Settings'),

    -- Sinks
    (1, 'Sinks', 'SNK-001', 'Single Bowl Stainless Steel Sink - 24x18 inch'),
    (1, 'Sinks', 'SNK-002', 'Double Bowl Stainless Steel Sink - 37x18 inch'),
    (1, 'Sinks', 'SNK-003', 'Granite Composite Sink - Matte Black'),
    (1, 'Sinks', 'SNK-004', 'Undermount Stainless Steel Sink - 30x18 inch'),
    (1, 'Sinks', 'SNK-005', 'Corner Sink - Stainless Steel Single Bowl'),

    -- Faucets
    (1, 'Faucets', 'FCT-001', 'Single Lever Sink Mixer - Chrome Finish'),
    (1, 'Faucets', 'FCT-002', 'Pull-Down Kitchen Faucet - Matte Black'),
    (1, 'Faucets', 'FCT-003', 'Wall Mounted Faucet - Brushed Nickel'),
    (1, 'Faucets', 'FCT-004', 'Touchless Sensor Faucet - Chrome Finish'),
    (1, 'Faucets', 'FCT-005', 'Swan Neck Faucet - Rose Gold Finish');
