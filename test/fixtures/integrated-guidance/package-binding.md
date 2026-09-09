# Declared package binding

Use the delivered package tarball recorded by the coordinator:

```text
name: assuredloop-base
version: 0.1.0
tarball: assuredloop-base-0.1.0.tgz
integrity: sha512-X09mSc+dOUZ1n9fBywD7OBCHeYh7s6bjO7rc94s5AuRxe1ju58/UbXlkBLSvz4VSt3GKsGwlho1uzViDiR3/XQ==
contract_metadata: contracts/metadata.json
```

The package is an installed dependency for the trial, not this source checkout. A fresh executor receives its unpacked root as `<installed-package-root>` and must resolve all guidance, contracts, schemas, and templates from that root. The package metadata records the framework source and bootstrap basis; it does not supply consumer work history or owner authorization.
