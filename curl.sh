cmd=( "$@" )

json_array() {
  echo -n '['
  while [ $# -gt 0 ]; do
    x=${1//\\/\\\\}
    echo -n \"${x//\"/\\\"}\"
    [ $# -gt 1 ] && echo -n ', '
    shift
  done
  echo ']'
}

: ${REGION:="local"}

data=$(json_array "${cmd[@]}")

curl -X POST $CURL_ENDPOINT/curl \
--header "Authorization: $CURL_SECRET" \
--header "Content-Type: text/plain" \
--data "{\"region\":\"$REGION\",\"args\":$data}"