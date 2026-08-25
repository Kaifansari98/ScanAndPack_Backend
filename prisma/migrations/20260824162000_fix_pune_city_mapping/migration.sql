-- Update Vloq Pune (FURNIXPUNE) city_id to point to the correct ID of Pune city in CityMaster
UPDATE "FranchiseMaster" 
SET city_id = COALESCE(
  (SELECT id FROM "CityMaster" WHERE name ILIKE 'pune' LIMIT 1),
  city_id
)
WHERE franchise_code = 'FURNIXPUNE';
