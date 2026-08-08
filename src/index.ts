#!/usr/bin/env node
import { Command } from "commander";
import init from "./commands/init.js";


const program = new Command();

program
  .name("nspt")
  .description("Secure, serverless .env sync for teams")
  .version("0.0.1");

init(program);


program.parse();