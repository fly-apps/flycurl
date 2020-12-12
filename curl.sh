cmd=( "$@" )

json_array() {
  echo '['
  while [ $# -gt 0 ]; do
    x=${1//\\/\\\\}
    echo \"${x//\"/\\\"}\"
    [ $# -gt 1 ] && echo ', '
    shift
  done
  echo ']'
}

: ${REGION:="local"}

data=$(json_array "${cmd[@]}")
echo $data
curl -X POST $CURL_ENDPOINT/curl \
--header "Authorization: $CURL_SECRET" \
--header "Content-Type: text/plain" \
--data "{\"region\":\"$REGION\",\"args\":$data}"