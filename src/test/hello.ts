import { Encrypter } from "age-encryption";

async function main() {
  const bobsPublicKey = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIC2u8OkP5IaRNw6mtUOWJqC1K05nmKrVc9o0xjUI5hDT"; // use your own for now
  const e = new Encrypter();
  e.addRecipient(bobsPublicKey);
  const wrapped = await e.encrypt("test file key");
  console.log("success:", wrapped);
}

main();