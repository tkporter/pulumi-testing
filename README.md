1. Install Pulumi: https://www.pulumi.com/docs/install/
2. Create a local directory that will store the Pulumi backend:
```
mkdir ~/pulumi-backend && pulumi login file://~/pulumi-backend
```
3. In a different terminal, start `anvil`
4. In this directory, run `pulumi up`
5. Select the stack called `testing`
6. The passphrase is nothing, so just press enter
7. Deploy it
8. Try changing values in `index.ts`, for example:
  a. Add or change remote gas data values
  b. Create a new storage gas oracle altogether
9. Run `pulumi up` again to idempotently apply any changes
