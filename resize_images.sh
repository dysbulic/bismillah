#!/bin/bash

# Different images need different sized versions depending on the
# page that they are on. There is a data file with this information
data=heights.info.txt
originalsdir=originals
MAXWIDTH=1000;
MAXHEIGHT=575;

exec < "$data"
while read line; do
    if [ "$line" != "${line#\#}" ]; then
        continue
    fi
    size=${line%% *}
    filename="${line#* }"
    while [ "$filename" != "${filename# }" ]; do
        filename="${filename# }"
    done
    # size parameter starts with a .5 if the limiting axis is height
    if [ ${size#*x} != $size ]; then
        width=$(dc -e "$MAXWIDTH ${size%x*} * p")
        height=$(dc -e "$MAXHEIGHT ${size#*x} * p")
    else
        width=$(dc -e "$MAXWIDTH ${size} * p")
        height=$(dc -e "$MAXHEIGHT ${size} * p")
    fi
    width=${width%.*}
    height=${height%.*}
    info=$(identify "$originalsdir/$filename" | sed -e 's/.* \([[:digit:]]\+x[[:digit:]]\+\) .*$/\1/');
    ext=${filename##*.}
    newfilename="${filename%$ext}sized.$ext";
    if [ ! -e "$newfilename" ]; then
        if [[ ${info%x*} -gt $width || ${info#*x} -gt $height ]]; then
            echo "Resizing: ${info%x*}x${info#*x} > ${width}x$height ($size): $filename"
            convert -resize ${width}x${height} "$originalsdir/$filename" "$newfilename"
        else
            echo "Linking: ${info%x*}x${info#*x} <= ${width}x$height ($size): $filename";
            ln -s "$originalsdir/$filename" "$newfilename"
        fi
    fi
done
