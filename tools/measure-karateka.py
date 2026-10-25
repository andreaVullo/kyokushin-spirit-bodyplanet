from pathlib import Path
from PIL import Image
import numpy as np
import json
from statistics import median

import argparse
parser=argparse.ArgumentParser(description='Measure sprite bounds without altering images; requires Pillow and NumPy.')
parser.add_argument('sprites',type=Path)
parser.add_argument('output',type=Path)
args=parser.parse_args()
ROOT=args.sprites

def measure(path):
    alpha=np.asarray(Image.open(path).convert('RGBA'))[:,:,3]
    mask=alpha>=100
    H,W=mask.shape
    parents=[]; runs=[]; previous=[]
    def root(k):
        while parents[k]!=k:
            parents[k]=parents[parents[k]]; k=parents[k]
        return k
    for y,row in enumerate(mask):
        diff=np.diff(np.pad(row.astype(np.int8),(1,1)))
        starts=np.flatnonzero(diff==1); ends=np.flatnonzero(diff==-1)
        current=[]; pi=0
        for x,e in zip(starts,ends):
            x=int(x); e=int(e); k=len(parents); parents.append(k); runs.append((y,x,e,k)); current.append((x,e,k))
            while pi<len(previous) and previous[pi][1]<=x: pi+=1
            j=pi
            while j<len(previous) and previous[j][0]<e:
                a=root(k); b=root(previous[j][2]); parents[a]=b; j+=1
        previous=current
    parts={}
    for y,x,e,k in runs:
        r=root(k)
        p=parts.setdefault(r,{'left':W,'top':H,'right':0,'bottom':0,'size':0,'runs':[]})
        p['left']=min(x,p['left']);p['right']=max(e,p['right']);p['top']=min(y,p['top']);p['bottom']=max(y+1,p['bottom']);p['size']+=e-x;p['runs'].append((y,x,e))
    parts=[p for p in parts.values() if p['size']>5000]
    parts.sort(key=lambda p:p['size'],reverse=True)
    rows=3 if path.name=='base.png' else 4; cols=4
    frames=[]
    for row in range(rows):
        for col in range(cols):
            x=col*W/cols; y=row*H/rows; xr=(col+1)*W/cols;yr=(row+1)*H/rows
            def overlap(p):return max(0,min(xr,p['right'])-max(x,p['left']))*max(0,min(yr,p['bottom'])-max(y,p['top']))
            p=max(parts,key=overlap)
            selected=parts.index(p)
            footruns=[r for r in p['runs'] if r[0]>=p['bottom']-max(5,round((p['bottom']-p['top'])*.045))]
            fx0=min(r[1] for r in footruns);fx1=max(r[2] for r in footruns)
            # Crop coordinates include soft antialiased edge. Exact component isolation still advised.
            x0=max(0,p['left']-2);y0=max(0,p['top']-2);x1=min(W,p['right']+2);y1=min(H,p['bottom']+2)
            frames.append({'index':row*4+col,'row':row,'col':col,'component':selected,'region':[x0,y0,x1-x0,y1-y0,round((fx0+fx1)/2,2),p['bottom']-1], 'opaque_bounds':[p['left'],p['top'],p['right']-p['left'],p['bottom']-p['top']], 'opaque_pixels':p['size']})
    refs={'base':[0,1,2,3],'pugni':[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],'calci':[0,3,4,7,8,11,12,15],'movimento':[0,1,2,3],'difesa':[0,3,4,7,8]}[path.stem]
    nominal_height=median(frames[i]['opaque_bounds'][3] for i in refs)
    for frame in frames:
        frame['source_sheet']=path.stem
        frame['source_frame']=frame['index']
        if path.stem=='difesa' and frame['index'] in [12,13]:
            b=frame['opaque_bounds']
            frame['region'][4]=b[0]+b[2]/2
            frame['anchor_mode']='fallen-body-centre-and-floor'
        else:
            frame['anchor_mode']='lowest-feet-centre-and-floor'
    return {'width':W,'height':H,'rows':rows,'cols':cols,'nominal_height':nominal_height,'scale_for_228px_fighter':228/nominal_height,'large_components':len(parts),'unique_components':len(set(f['component'] for f in frames)), 'frames':frames}

out={}
for folder in sorted(ROOT.glob('[0-9]*')):
    out[folder.name]={}
    for cat in ['base','pugni','calci','movimento','difesa']:
        o=measure(folder/(cat+'.png'));out[folder.name][cat]=o
        print(folder.name,cat,len(o['frames']),o['large_components'],o['unique_components'],flush=True)
    defense=out[folder.name]['difesa']
    if defense['unique_components']<16:
        defense['overlap_warning']='The victory raised fist touches the recovery guard in frames 11 and 15. Those figures cannot be separated cleanly without repainting. Use intact recovery guard 0 and base victory 11 instead.'
        for original,replacement_sheet,replacement in [(11,'difesa',0),(15,'base',11)]:
            prior=defense['frames'][original]
            target=out[folder.name][replacement_sheet]['frames'][replacement]
            safe=dict(target)
            safe.update(index=original,row=original//4,col=original%4,source_sheet=replacement_sheet,source_frame=replacement,original_region=prior['region'],fallback_reason='touching_neighbour_pose')
            defense['frames'][original]=safe
args.output.write_text(json.dumps(out,ensure_ascii=False,indent=2))
