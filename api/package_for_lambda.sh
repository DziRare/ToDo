#!/bin/bash

#Exit if command fails
set -eux pipfail

pip install \
  --platform manylinux2014_x86_64 \
  --only-binary=:all: \
  -t lib -r requirements.txt
(cd lib; zip ../lambda_function.zip -r .)
zip lambda_function.zip -u todo.py

#Clean Up
rm -rf lib