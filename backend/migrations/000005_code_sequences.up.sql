CREATE TABLE code_sequences (
  tenant_id  uuid NOT NULL,
  prefix     varchar(8) NOT NULL,
  last_value bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, prefix),
  FOREIGN KEY (tenant_id) REFERENCES tenants (id)
);

INSERT INTO code_sequences (tenant_id, prefix, last_value)
SELECT tenant_id, 'CUS',
       COALESCE(MAX((regexp_match(code, '^CUS-([0-9]+)$'))[1]::bigint), 0)
FROM customers GROUP BY tenant_id;

INSERT INTO code_sequences (tenant_id, prefix, last_value)
SELECT tenant_id, 'SUP',
       COALESCE(MAX((regexp_match(code, '^SUP-([0-9]+)$'))[1]::bigint), 0)
FROM suppliers GROUP BY tenant_id;

INSERT INTO code_sequences (tenant_id, prefix, last_value)
SELECT tenant_id, 'WH',
       COALESCE(MAX((regexp_match(code, '^WH-([0-9]+)$'))[1]::bigint), 0)
FROM warehouses GROUP BY tenant_id;
