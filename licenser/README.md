## Script to add license header to all files (recursive) in a directory

### Actions:

Actions are specified in fileSpecs configuration object. Each time a file match a specs all actions defined in the specification will be applies. 

#### addHeader

- For each file type a Specifications are defined in fileSpecs array
   - startBlock: The starting line of the license block (used to determine 
     if file already has a lincense)
   - lineBlock: Will replace all line return '\n' of LICENSE file  
   - endBlock: The end of the license block. Used to determine the end 
      of extising license.

- Replaces existing license header if found
  if spec.startBlock is found in the firsts bytes of the files, 
   - read full file content  
   - remove all lines between spec.startBlock and spec.endBlock
   - save bakc the file

- Prepend the License content to all files matching a spec.

Note: speed by could be optimzed, 
 1- do not remove /replace license in files that have a valid license header
 2- when difference is found and license needs to be changed. Directly
   change the license instead of having a intermediary remove - save step

