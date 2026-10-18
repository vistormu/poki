package main

import (
	_ "time/tzdata" // TZ works on an image with no os tz database (the terminal's today)

	"poki/cmd"
)

func main() {
	cmd.Execute()
}
