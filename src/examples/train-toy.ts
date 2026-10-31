import {TransformerModel} from "../model.js";import {Trainer} from "../training.js";import {VocabularyTokenizer} from "../tokenizer.js";
const corpus=["the cat sat","the dog sat","the cat slept","a dog slept"];const tok=new VocabularyTokenizer().fit(corpus);
const model=new TransformerModel({vocabSize:tok.vocabSize,maxSequenceLength:16,dModel:16,numHeads:2,dFeedForward:32,numLayers:1,seed:7});const trainer=new Trainer(model,{learningRate:0.002});
const samples=corpus.map(s=>tok.encode(s,true,true));for(let epoch=0;epoch<15;epoch++){let loss=0;for(const ids of samples)loss+=trainer.trainSequence(ids.slice(0,-1),ids.slice(1)).loss;if(epoch%5===0)console.log("epoch",epoch,"loss",(loss/samples.length).toFixed(4));}
console.log("sample:",tok.decode(model.generate(tok.encode("the cat",true),5)));
